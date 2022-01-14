#!/bin/bash

# generate a local dockerfile for local test builds

rm -f Dockerfile.local
cp Dockerfile Dockerfile.local

# Delete the copy line necessary for github actions
# This is a nice convenience for using cached builds

sed -i '/COPY rootfs\/ \//d' Dockerfile.local
sed -i '/ADD webapp.tar.gz \//d' Dockerfile.local

# move the COPY FS line back to the bottom so that we can use cached builds
sed -i 's/ENTRYPOINT \[ "\/init" \]/COPY rootfs\/ \/\nCOPY webapp\/ \/webapp\/\nCOPY version \/acarshub-version\nENTRYPOINT \[ "\/init" \]\n/g' Dockerfile.local
