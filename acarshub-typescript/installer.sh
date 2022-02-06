#!/bin/bash

# Clean up the install dir
rm -rf ../rootfs/webapp/static/images/* || exit 1
rm -rf ../rootfs/webapp/static/js/* || exit 1
rm -rf ../rootfs/webapp/static/sounds/* || exit 1
rm -rf ../rootfs/webapp/templates/* || exit 1

# recreate the dir structure

mkdir -p ../rootfs/webapp/static/images || exit 1
mkdir -p ../rootfs/webapp/static/js || exit 1
mkdir -p ../rootfs/webapp/static/sounds || exit 1
mkdir -p ../rootfs/webapp/templates || exit 1

# copy the assets to the correct place
cp -r ./dist/static/images ../rootfs/webapp/static/ || exit 1
cp -r ./dist/static/sounds ../rootfs/webapp/static/ || exit 1
cp -r ./dist/static/js ../rootfs/webapp/static/ || exit 1
cp -r ./dist/static/index.html ../rootfs/webapp/templates/ || exit 1
cp -r ./dist/static/js/helppage.MD ../rootfs/webapp/templates/ || exit 1
