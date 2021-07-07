#!/bin/bash

pushd ../rootfs/webapp || exit 1

< requirements.txt grep -v 'rrdtool' | xargs -I {} python3 -m pip install {}

popd || exit 1
pushd ../acarshub-typescript || exit 1
npm i
