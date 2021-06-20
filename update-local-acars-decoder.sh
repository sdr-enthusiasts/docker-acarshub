#!/bin/bash

# Will clone the typescript code to the parent dir, build, and copy in to
# ACARS Hub tree where appropriate

rm -rf ../acars-decoder-typescript
pushd ../ || exit
git clone https://github.com/airframesio/acars-decoder-typescript.git

pushd acars-decoder-typescript || exit
mkdir build-output

sed -i.bu '/"module": "commonjs",/d' tsconfig.json && \
yarn install && \
yarn build && \
yarn pack --filename build-output/acars-decoder-typescript.tgz

pushd build-output || exit
tar xvf acars-decoder-typescript.tgz -C .
pushd package/dist || exit

find . -type f -iname '*.js' -exec sed -i.bu """/import .* from '.*';/ s/';/.js';/""" {} \;
find . -type f -iname '*.js' -exec sed -i.bu """/import .* from \".*\";/ s/\";/.js\";/""" {} \;
find . -type f -iname '*.js' -exec sed -i.bu """/export .* from '.*';/ s/';/.js';/""" {} \;
find . -type f -iname '*.js' -exec sed -i.bu """/export .* from \".*\";/ s/\";/.js\";/""" {} \;

rm -rf ../docker-acarshub/rootfs/webapp/static/airframes-acars-decoder
rm -rf ./*.bu

mkdir -p ../docker-acarshub/rootfs/webapp/static/airframes-acars-decoder
cp -r . ../docker-acarshub/rootfs/webapp/static/airframes-acars-decoder
