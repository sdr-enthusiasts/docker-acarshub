#!/bin/sh

# ./node_modules/.bin/tsc

find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import Cookies from \"js-cookie\";/import Cookies from \".\/other\/js.cookie.min.mjs\";/g;" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import { MessageDecoder } from \"@airframes\/acars-decoder\/dist\/MessageDecoder\";/import { MessageDecoder } from \"..\/airframes-acars-decoder\/MessageDecoder.js\"/g;" {} \;

find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import { Chart } from \"chart.js\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import ChartDataLabels from \"chartjs-plugin-datalabels\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import showdown from \"showdown\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import jBox from \"jbox\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import \"jbox\/dist\/jBox.all.css\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import \* as L from \"leaflet\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import { io, Socket } from \"socket.io-client\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import palette from \"palette\";//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import { getBaseMarker, svgShapeToURI } from \"aircraft_icons\"//g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import { search_database, window } from \".\/index.js\";/import { search_database } from \".\/index.js\";/g" {} \;
find ./dist/ -maxdepth 1 -type f -iname '*.js' -exec sed -i "s/import { window } from \".\/index.js\";//g" {} \;
