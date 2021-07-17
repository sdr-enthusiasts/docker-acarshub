#!/bin/bash

rm -rf ../rootfs/webapp/templates
rm -rf ../rootfs/webapp/static/js
rm -rf ../rootfs/webapp/static/css

mkdir -p ../rootfs/webapp/static/css/other
mkdir -p ../rootfs/webapp/static/js/other
mkdir -p ../rootfs/webapp/templates

cp ./html/* ../rootfs/webapp/templates
cp ./dist-min/*.js ../rootfs/webapp/static/js/
cp ./js-other/* ../rootfs/webapp/static/js/other/
cp ./css-min/site.css ../rootfs/webapp/static/css/site.css
cp -r ./css/other/* ../rootfs/webapp/static/css/other/
