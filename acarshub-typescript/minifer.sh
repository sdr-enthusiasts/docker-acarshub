#!/bin/bash

find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i.bu "/^import./d" {} \;

printf "import { MessageDecoder } from \"../airframes-acars-decoder/MessageDecoder.js\";\nimport Cookies from \"./other/js.cookie.min.mjs\";" | cat - ./dist/about.js > ./dist/about.tmp
rm ./dist/about.js
mv ./dist/about.tmp ./dist/about.js

rm -f ./dist/*.bu
