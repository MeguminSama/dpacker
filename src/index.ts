import fs from "fs";
import { sync as rimraf } from "rimraf";
import path from "path";
import jsBeautify from "js-beautify";
import unpack from "webpack-unpack";

// delete & remake out dir
if (fs.existsSync("out")) {
  rimraf("out");
}
fs.mkdirSync("out");

// must be at least 3 args
if (process.argv.length < 3)
  console.log("invalid path provided..."), process.exit();

const dirName = process.argv[2];

const beautifyIt = process.argv[3] === "-b";

const files = fs.readdirSync(dirName);

for (const inFile of files) {
  const inPath = path.join(dirName, inFile);
  const fileName = inFile.replace(/\.js$/i, "");

  const fileData = fs.readFileSync(inPath).toString();

  const data = unpack(fileData);

  if (!data) continue;

  for (const item of data) {
    const newFileName = genNewFilePath(item.id);
    const newFile = path.join("out", `${newFileName}.js`);

    if (beautifyIt) {
      item.source = jsBeautify(item.source);
      console.log(`${fileName} | Beautified: ${newFile}}`);
    }

    fs.writeFileSync(newFile, item.source);
    console.log(`${fileName} | Written: ${newFile}`);
  }
}

function genNewFilePath(fileName: string | number, i = 0) {
  if (!fs.existsSync(path.join("out", `${fileName}.js`))) return fileName;

  const p = path.join("out", `${fileName}-${i}.js`);

  if (fs.existsSync(p)) {
    genNewFilePath(fileName, ++i);
  } else {
    return `${fileName}-${i}`;
  }
}
