#!/bin/bash

REPO=fredclausen
IMAGE=acarshub

# Generate local dockerfile
./generate_local_dockerfile.sh

#  move the local built copy of airframes out of rootfs
if [ -d ./rootfs/webapp/static/airframes-acars-decoder ]; then
    mv -f rootfs/webapp/static/airframes-acars-decoder .
elif [ -d ./acarshub-typescript ]; then
    echo "Directory previously moved, skipping"
else
    echo "acarshub-typescript missing in both places, exiting"
    return 1
fi

set -xe

# Build airframesio/acars-decoder-typescript
# Copy /src/acars-decoder-typescript.tgz out of image
docker build --file ./Dockerfile.acars-decoder-typescript -t acars-decoder-typescript:latest .

id=$(docker create acars-decoder-typescript:latest)
docker cp "$id":/src/acars-decoder-typescript.tgz ./acars-decoder-typescript.tgz
docker rm -v "$id"

# build the acarshub typescript
docker build --file ./Dockerfile.acarshub-typescript -t acarshub-typescript:latest .

id=$(docker create acarshub-typescript:latest)
docker cp "$id":/rootfs/webapp/static/js .
docker rm -v "$id"

# Build & push latest
docker build -f Dockerfile.local -t "${REPO}/${IMAGE}:test" .

# Clean up
rm ./acars-decoder-typescript.tgz
rm -rf js

#  move the local built copy of airframes out of rootfs
mv airframes-acars-decoder rootfs/webapp/static/airframes-acars-decoder
