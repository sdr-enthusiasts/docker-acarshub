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
  rm -rf ./webapp
  exit 0
}

# build the acarshub typescript
docker build --file ./Dockerfile.acarshub-typescript -t acarshub-typescript:latest . || cleanup
id=$(docker create acarshub-typescript:latest) || cleanup
docker cp "$id":/rootfs/webapp ./ || cleanup
docker rm -v "$id" || cleanup
sleep 3

# Generate local dockerfile
./generate_local_dockerfile.sh || cleanup

# Build & push latest
docker build -f Dockerfile.local -t "${REPO}/${IMAGE}:test" . || cleanup

# Clean up
cleanup
