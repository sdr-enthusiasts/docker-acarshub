#!/bin/bash

REPO=fredclausen
IMAGE=acarshub

# Generate local dockerfile
./generate_local_dockerfile.sh

set -xe

# Build airframesio/acars-decoder-typescript
# Copy /src/acars-decoder-typescript.tgz out of image
# docker build --file ./Dockerfile.acars-decoder-typescript -t acars-decoder-typescript:latest .

cleanup() {
    rm -rf ./acars-decoder-typescript.tgz
    rm -rf ./webapp
    rm -rf ./package
    exit 0
}

id=$(docker create acars-decoder-typescript:latest)
docker cp "$id":/src/acars-decoder-typescript.tgz ./acars-decoder-typescript.tgz || cleanup
docker rm -v "$id"|| cleanup

# build the acarshub typescript
docker build --file ./Dockerfile.acarshub-typescript -t acarshub-typescript:latest . || cleanup
id=$(docker create acarshub-typescript:latest) || cleanup
docker cp "$id":/rootfs/webapp ./ || cleanup
docker rm -v "$id" || cleanup
sleep 3
tar -xf acars-decoder-typescript.tgz package/dist/MessageDecoder.js || cleanup
NEW_MD5_MD=$(md5sum package/dist/MessageDecoder.js | awk -F' ' '{print $1}') || cleanup
INDEX_PATH=$(ls webapp/static/js/index*.js) || cleanup
OLD_MD5=$(md5sum "$INDEX_PATH" | awk -F' ' '{print $1}') || cleanup
# shellcheck disable=SC2116
echo "$NEW_MD5_MD" | xargs -I '{}' sed -i "s/MessageDecoder.js/MessageDecoder\.$(echo {}\.js)/g" "$INDEX_PATH" || cleanup
NEW_MD5=$(md5sum "$INDEX_PATH" | awk -F' ' '{print $1}') || cleanup
# shellcheck disable=SC2046,SC2001
mv "$INDEX_PATH" $(echo "$INDEX_PATH" | sed -e "s/$OLD_MD5/$NEW_MD5/g") || cleanup
sed -i "s/$OLD_MD5/$NEW_MD5/g" webapp/templates/index.html || cleanup

# Build & push latest
docker build -f Dockerfile.local -t "${REPO}/${IMAGE}:test" . || cleanup

# Clean up
cleanup
