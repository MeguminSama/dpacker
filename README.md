# DPacker

A webpack module splitter & beautifier

Originally designed for discord.. but can be used for pretty much anything..

## Usage

Make sure all your files are in one folder (no subfolders).
In this example, I will call it `assets-canary`

Simply run...

```shell
npx dpacker ./assets-canary [-b]
```

the `-b` is optional, and will auto-beautify the JS files as they're written.

The files will be written into an `out` folder :)
