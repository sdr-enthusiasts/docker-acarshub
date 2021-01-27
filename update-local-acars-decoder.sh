#!/bin/bash

rm -rf /Users/Git/acars-decoder-typescript
pushd /Users/Git/ 
git clone https://github.com/airframesio/acars-decoder-typescript.git . 

pushd acars-decoder-typescript
mkdir build-output

sed -i.bu '/"module": "commonjs",/d' tsconfig.json && \
yarn install && \
yarn build && \
yarn pack --filename build-output/acars-decoder-typescript.tgz

pushd build-output
tar xvf /src/acars-decoder-typescript.tgz -C .
pushd package/dist

find . -type f -iname '*.js' -exec sed -i.bu """/import .* from '.*';/ s/';/.js';/""" {} \;
find . -type f -iname '*.js' -exec sed -i.bu """/import .* from \".*\";/ s/\";/.js\";/""" {} \;
find . -type f -iname '*.js' -exec sed -i.bu """/export .* from '.*';/ s/';/.js';/""" {} \;
find . -type f -iname '*.js' -exec sed -i.bu """/export .* from \".*\";/ s/\";/.js\";/""" {} \;

rm -rf /Users/fred/Git/docker-acarshub/rootfs/webapp/static/airframes-acars-decoder
rm -rf *.bu

mkdir -p /Users/fred/Git/docker-acarshub/rootfs/webapp/static/airframes-acars-decoder
cp -r . /Users/fred/Git/docker-acarshub/rootfs/webapp/static/airframes-acars-decoder