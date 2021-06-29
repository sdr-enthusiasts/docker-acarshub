#!/bin/bash

pushd ../rootfs/webapp

< requirements.txt grep -v 'rrdtool' | xargs -I {} python3 -m pip install {}
