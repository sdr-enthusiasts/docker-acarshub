#!/bin/bash

# generate a local dockerfile for local test builds

rm -f Dockerfile.local
cp Dockerfile Dockerfile.local

# Delete the copy line necessary for github actions
# however, we do need the python requirements copied in, so we'll copy early
# This is a nice convenience for using cached builds

sed -i 's/COPY rootfs\/ \//COPY rootfs\/webapp\/requirements.txt \/webapp\/requirements.txt/g' Dockerfile.local
sed -i '/COPY webapp.tar.gz \/src\/webapp.tar.gz/d' Dockerfile.local
sed -i '/tar -xzvf \/src\/webapp.tar.gz -C \/ && \\/d' Dockerfile.local

# move the COPY FS line back to the bottom so that we can use cached builds
sed -i 's/ENTRYPOINT \[ "\/init" \]/COPY rootfs\/ \/\nCOPY webapp\/ \/webapp\/\nCOPY version \/acarshub-version\nENTRYPOINT \[ "\/init" \]\n/g' Dockerfile.local
