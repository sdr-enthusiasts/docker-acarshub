#!/bin/bash

REPO=fredclausen
IMAGE=acarshub

# Generate local dockerfile
./generate_local_dockerfile.sh

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
mkdir -p ./webapp/static/
docker cp "$id":/rootfs/webapp/static/js ./webapp/static/js
docker cp "$id":/rootfs/webapp/static/css ./webapp/static/css
docker rm -v "$id"
tar cvfz webapp.tar.gz ./webapp
rm -rf ./webapp

# Build & push latest
docker build -f Dockerfile.local -t "${REPO}/${IMAGE}:test" .

# Clean up
rm ./acars-decoder-typescript.tgz
rm ./webapp.tar.gz
