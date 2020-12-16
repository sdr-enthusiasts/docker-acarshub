#!/bin/bash

# generate a local dockerfile for local test builds

rm -f Dockerfile.local
cp Dockerfile Dockerfile.local

#.bu needed on my mac for reasons I don't understand but am going with
sed -i.bu 's/COPY rootfs\/ \///g' Dockerfile.local
sed -i.bu 's/ENTRYPOINT \[ "\/init" \]/COPY rootfs\/ \/\nENTRYPOINT \[ "\/init" \]\n/g' Dockerfile.local
rm -f Dockerfile.local.bu