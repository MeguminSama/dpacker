import fs from "fs";
import { sync as rimraf } from "rimraf";
import path from "path";
import jsBeautify from "js-beautify";
import unpack from "./unpack.js";
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";

const currDir = process.cwd();

const helpInfo: commandLineUsage.Section[] = [
  {
    header: "DPacker",
    content: "A tool to debundle webpack modules",
  },
  {
    header: "Example Usage",
    content: "npx dpacker ./assets -b -v",
  },
  {
    header: "Options",
    optionList: [
      {
        name: "input",
        alias: "i",
        typeLabel: "{underline directory}",
        description: "The input folder to debundle",
      },
      {
        name: "outDir",
        alias: "o",
        typeLabel: "{underline ./out}",
        description: "The output folder to save the debundled files.",
      },
      {
        name: "manifest",
        alias: "m",
        typeLabel: "{underline manifest.json}",
        description: "The manifest file path to generate",
      },
      {
        name: "verbose",
        alias: "v",
        description: "Prints verbose output",
        type: Boolean,
      },
      {
        name: "beautify",
        alias: "b",
        description: "Beautifies the output",
        type: Boolean,
      },
      {
        name: "allowDuplicates",
        alias: "d",
        description:
          "Allows duplicate files to be generated in format 'fileName-n'",
        type: Boolean,
      },
      {
        name: "force",
        alias: "f",
        description: "Forces the tool to overwrite existing files",
        type: Boolean,
      },
      {
        name: "help",
        alias: "h",
        description: "Prints this help message",
        type: Boolean,
      },
    ],
  },
  {
    header: "Source & Support",
    content: "Available on Github at https://github.com/meguminsama/dpacker",
  },
];

const usageHelp = commandLineUsage(helpInfo);

const argDefinitions: commandLineArgs.OptionDefinition[] = [
  { name: "input", alias: "i", type: String, defaultOption: false },
  {
    name: "outDir",
    alias: "o",
    type: String,
    defaultValue: path.join(currDir, "out"),
  },
  { name: "manifest", alias: "m", type: String, defaultValue: null },
  { name: "verbose", alias: "v", type: Boolean, defaultValue: false },
  { name: "beautify", alias: "b", type: Boolean, defaultValue: false },
  { name: "allowDuplicates", alias: "d", type: Boolean, defaultValue: false },
  { name: "force", alias: "f", type: Boolean, defaultValue: false },
  { name: "help", alias: "h", type: Boolean, defaultValue: false },
];

const options: {
  verbose: boolean;
  beautify: boolean;
  allowDuplicates: boolean;
  outDir: string;
  input: string;
  manifest: string | boolean | null;
  force: boolean;
  help: boolean;
} = commandLineArgs(argDefinitions) as any;

if (options.help) {
  console.log(usageHelp);
  process.exit();
}

if (!options.input) {
  console.error("No input directory specified");
  process.exit(1);
}

const dirName = options.input;

let MANIFEST_PATH = "";

if (options.manifest) {
  if (typeof options.manifest === "string") {
    if (options.manifest.toLowerCase() !== "false")
      MANIFEST_PATH = options.manifest;
  } else if (typeof options.manifest === "boolean") {
    MANIFEST_PATH = path.join(options.outDir, "manifest.json");
  }
}

// delete & remake out dir
if (!fs.existsSync(options.outDir)) {
  fs.mkdirSync(options.outDir);
} else {
  if (options.force) {
    rimraf(options.outDir);
    fs.mkdirSync(options.outDir);
  } else {
    console.error(`directory ${options.outDir} already exists...`);
    console.error(`use --force to overwrite the contents of this folder.`);
    process.exit(1);
  }
}

const files = fs.readdirSync(dirName).filter((f) => f.endsWith(".js"));

const manifest: {
  [k: string]: {
    modules: {
      [k: string]: {
        fileName: string;
        deps: string[];
      };
    };
  };
} = {};

for (const inFile of files) {
  const inPath = path.join(dirName, inFile);
  const fileName = inFile.replace(/\.js$/i, "");

  const fileData = fs.readFileSync(inPath).toString();

  const data = unpack(fileData);

  if (!data) continue;

  const fileId = path.parse(inFile).base;

  if (options.manifest) {
    manifest[fileId] = { modules: {} };
  }

  for (const item of data) {
    const newFileName = genNewFilePath(item.id);
    if (newFileName === undefined) continue;
    const newFile = path.join(options.outDir, `${newFileName}.js`);

    if (options.beautify) {
      item.source = jsBeautify(item.source);
    }

    if (options.manifest) {
      manifest[fileId].modules[item.id] = {
        fileName: path.parse(newFile).base,
        deps: Object.keys(item.deps),
      };
    }

    fs.writeFileSync(newFile, item.source);
    if (options.verbose) console.log(`${fileName} | Written: ${newFile}`);
  }
}

if (options.manifest) {
  fs.writeFileSync(
    path.join(".", MANIFEST_PATH),
    JSON.stringify(manifest, null, 4)
  );
}

function genNewFilePath(fileName: string | number, i = 0) {
  if (!fs.existsSync(path.join(options.outDir, `${fileName}.js`)))
    return fileName;

  if (!options.allowDuplicates) return undefined;

  const p = path.join(options.outDir, `${fileName}-${i}.js`);

  if (fs.existsSync(p)) {
    genNewFilePath(fileName, ++i);
  } else {
    return `${fileName}-${i}`;
  }
}
