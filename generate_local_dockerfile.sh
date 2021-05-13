#!/bin/bash

# generate a local dockerfile for local test builds

rm -f Dockerfile.local
cp Dockerfile Dockerfile.local

#.bu needed on my mac for reasons I don't understand but am going with

# Delete the copy line necessary for github actions
# however, we do need the python requirements copied in, so we'll copy early
# This is a nice convenience for using cached builds
sed -i.bu 's/COPY rootfs\/ \//COPY rootfs\/webapp\/requirements.txt \/webapp\/requirements.txt/g' Dockerfile.local

# move the COPY FS line back to the bottom so that we can use cached builds
sed -i.bu 's/ENTRYPOINT \[ "\/init" \]/COPY rootfs\/ \/\nENTRYPOINT \[ "\/init" \]\n/g' Dockerfile.local

# clean up...thanks mac
rm -f Dockerfile.local.bu
