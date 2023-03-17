# DPacker

A webpack module splitter & beautifier

Originally designed for discord.. but can be used for pretty much anything..

## Usage

Make sure all your files are in one folder (no subfolders).
In this example, I will call it `assets-canary`

Simply run...

```shell
npx dpacker ./assets-canary [-b] [-d]
```

## Parameters

| Flag name         | Shorthand | Default Value | Purpose                                                          |
| ----------------- | --------- | ------------- | ---------------------------------------------------------------- |
| --input           | -i        |               | The input directory of .js files                                 |
| --outDir          | -o        | ./out         | The file to output the separated files                           |
| --manifest        | -m        | null          | Generate a manifest file at the specified path                   |
| --verbose         | -v        | false         | Verbose output                                                   |
| --beautify        | -b        | false         | Beautify the outputted javascript files                          |
| --allowDuplicates | -d        | false         | Allows duplicate files to be generated when detected             |
| --force           | -f        | false         | If the output directory already exists, use this to overwrite it |
| --help            | -h        |               | Show the help menu                                               |

## Flags:

`-b` is optional, and will auto-beautify the JS files as they're written.

`-d` is optional, and will write duplicate files if they share the ID. (By default, it ignores duplicate files as there's usually not any difference)

The files will be written into an `out` folder :)

## Features

Splits large webpack bundle files into their individual modules. Has de-duplication built in, but can be disabled with the `-d` flag.

Converts requires and module.exports to correct form, rather than webpack's (e, t, n) format

`require`s that point to a module ID will be mapped to `require("./moduleId.js")` for IDE compatibility, and should help with recompilation.
