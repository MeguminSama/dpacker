// webpack-unpack
// obtained from https://github.com/goto-bus-stop/webpack-unpack
// modified to allow for arrow functions, "use-strict" declarations, & mapping require(123) to require("./123.js")

var assert = require("assert");
var acorn = require("acorn");
var astring = require("astring");
var scan = require("scope-analyzer");
var multisplice = require("multisplice");

module.exports = function unpack(source, opts) {
  var ast =
    typeof source === "object" && typeof source.type === "string"
      ? source
      : acorn.parse(source, { ecmaVersion: 2021 });

  if (opts && opts.source) {
    source = opts.source;
  }

  if (source && Buffer.isBuffer(source)) {
    source = source.toString();
  }

  // nullify source if a parsed ast was given in the first parameter
  if (ast === source) {
    source = null;
  }

  assert(
    !source || typeof source === "string",
    "webpack-unpack: source must be a string or Buffer"
  );

  var meta = unpackRuntimePrelude(ast);
  if (!meta) meta = unpackJsonpPrelude(ast);
  if (!meta) return;

  var entryId = meta.entryId;
  var factories = meta.factories;

  if (!factories.every(isFunctionOrEmpty)) {
    return;
  }

  var modules = [];
  for (var i = 0; i < factories.length; i++) {
    var factory = factories[i];
    if (factory.factory === null) continue;

    scan.crawl(factory.factory);
    // If source is available, rewrite the require,exports,module var names in place
    // Else, generate a string afterwards.
    var range = getModuleRange(factory.factory.body);
    var moduleSource = rewriteMagicIdentifiers(
      factory.factory,
      source ? source.slice(range.start, range.end) : null,
      range.start
    );
    if (!moduleSource) {
      moduleSource = astring.generate({
        type: "Program",
        body: factory.factory.body.body,
      });
    }

    var deps = getDependencies(factory.factory);

    modules.push({
      id: factory.index,
      source: moduleSource,
      deps: deps,
      entry: factory.index === entryId,
    });
  }

  return modules;
};

function unpackRuntimePrelude(ast) {
  // !(prelude)(factories)
  if (
    ast.body[0].type !== "ExpressionStatement" ||
    ast.body[0].expression.type !== "UnaryExpression" ||
    ast.body[0].expression.argument.type !== "CallExpression"
  ) {
    return;
  }

  // prelude = (function(t){})
  var outer = ast.body[0].expression.argument;
  if (
    outer.callee.type !== "FunctionExpression" ||
    outer.callee.params.length !== 1
  ) {
    return;
  }
  var prelude = outer.callee.body;

  // Find the entry point require call.
  var entryNode = find(prelude.body.slice().reverse(), function (node) {
    if (node.type !== "ExpressionStatement") return false;
    node = node.expression;
    if (node.type === "SequenceExpression") {
      var exprs = node.expressions;
      node = exprs[exprs.length - 1];
    }
    return (
      node.type === "CallExpression" &&
      node.arguments.length === 1 &&
      node.arguments[0].type === "AssignmentExpression"
    );
  });
  if (entryNode) {
    entryNode = entryNode.expression;
    if (entryNode.type === "SequenceExpression") {
      entryNode = entryNode.expressions[entryNode.expressions.length - 1];
    }
    entryNode = entryNode.arguments[0].right;
  }
  var entryId = entryNode ? entryNode.value : null;

  // factories = [function(){}]
  if (
    outer.arguments.length !== 1 ||
    (outer.arguments[0].type !== "ArrayExpression" &&
      outer.arguments[0].type !== "ObjectExpression")
  ) {
    return;
  }
  var factories = getFactories(outer.arguments[0]);

  return {
    factories: factories,
    entryId: entryId,
  };
}

function unpackJsonpPrelude(ast) {
  const idx = ast.body[0]?.expression?.value === "use strict" ? 1 : 0;

  // (prelude).push(factories)
  if (
    ast.body[idx].type !== "ExpressionStatement" ||
    ast.body[idx].expression.type !== "CallExpression" ||
    ast.body[idx].expression.callee.type !== "MemberExpression"
  ) {
    return;
  }

  var callee = ast.body[idx].expression.callee;
  // (webpackJsonp = webpackJsonp || []).push
  if (callee.computed || callee.property.name !== "push") return;
  if (callee.object.type !== "AssignmentExpression") return;

  var args = ast.body[idx].expression.arguments;
  // ([ [bundleIds], [factories])
  if (args.length !== 1) return;
  if (args[0].type !== "ArrayExpression") return;
  if (args[0].elements[0].type !== "ArrayExpression") return;
  if (
    args[0].elements[1].type !== "ArrayExpression" &&
    args[0].elements[1].type !== "ObjectExpression"
  )
    return;

  var factories = getFactories(args[0].elements[1]);

  return {
    factories: factories,
    entryId: undefined,
  };
}

function isFunctionOrEmpty(node) {
  return (
    node.factory === null ||
    node.factory.type === "FunctionExpression" ||
    node.factory.type === "ArrowFunctionExpression"
  );
}

function getModuleRange(body) {
  if (body.body.length === 0) {
    // exclude {} braces
    return { start: body.start + 1, end: body.end - 1 };
  }
  return {
    start: body.body[0].start,
    end: body.body[body.body.length - 1].end,
  };
}

function rewriteMagicIdentifiers(moduleWrapper, source, offset) {
  var magicBindings = moduleWrapper.params.map(scan.getBinding);
  var magicNames = ["module", "exports", "$$dprequire$$"];
  var edit = source ? multisplice(source) : null;

  magicBindings.forEach(function (binding, i) {
    var name = magicNames[i];
    binding.getReferences().forEach(function (ref) {
      if (ref === binding.definition) return;
      ref.name = name;
      if (edit) edit.splice(ref.start - offset, ref.end - offset, name);
    });
  });

  return edit
    ? edit.toString()
      // replace $$dprequire$$(id) with require("./id.js")
      .replace(/\$\$dprequire\$\$\(([\de]+)\)/g, (_, id) => {
        // Sometimes numbers use scientific notation (123e3). We need to convert these to decimal.
        return `require("./${Number(id)}.js")`
      })
      // some requires are in a require.x = "..." format, so just turn these back to require
      .replace(/\$\$dprequire\$\$/g, "require")
    : null;
}

function getDependencies(moduleWrapper) {
  var deps = {};
  if (moduleWrapper.params.length < 3) return deps;

  var req = scan.getBinding(moduleWrapper.params[2]);
  req.getReferences().forEach(function (ref) {
    if (
      ref.parent.type === "CallExpression" &&
      ref.parent.callee === ref &&
      ref.parent.arguments[0].type === "Literal"
    ) {
      deps[ref.parent.arguments[0].value] = ref.parent.arguments[0].value;
    }
  });

  return deps;
}

function find(arr, fn) {
  for (var i = 0; i < arr.length; i++) {
    if (fn(arr[i])) return arr[i];
  }
}

function getFactories(node) {
  if (node.type === "ArrayExpression") {
    return node.elements.map(function (factory, index) {
      return { factory: factory, index: index };
    });
  }
  if (node.type === "ObjectExpression") {
    return node.properties.map(function (prop) {
      var index;
      if (prop.key.type === "Literal") {
        index = prop.key.value;
      } else if (prop.key.type === "Identifier") {
        index = prop.key.name;
      }
      return { factory: prop.value, index: index };
    });
  }
  return [];
}
