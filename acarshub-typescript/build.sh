#!/bin/sh

# ./node_modules/.bin/tsc

pushd ./dist
find . -maxdepth 1 -type f -iname '*.js' -exec sed -i.bu "s/import Cookies from \"js-cookie\";/import Cookies from \".\/other\/js.cookie.min.mjs\";/g;" {} \;
find . -maxdepth 1 -type f -iname '*.js' -exec sed -i.bu "s/import { MessageDecoder } from \"@airframes\/acars-decoder\/dist\/MessageDecoder\";/import { MessageDecoder } from \"..\/airframes-acars-decoder\/MessageDecoder.js\"/g;" {} \;

find . -maxdepth 1 -type f -iname '*.js' -exec sed -i.bu "s/import { Chart } from \"chart.js\";//g" {} \;
find . -maxdepth 1 -type f -iname '*.js' -exec sed -i.bu "s/import ChartDataLabels from \"chartjs-plugin-datalabels\";//g" {} \;
find . -maxdepth 1 -type f -iname '*.js' -exec sed -i.bu "s/import showdown from \"showdown\";//g" {} \;

rm *.bu
