#!/bin/bash

REPO=fredclausen
IMAGE=acarshub

# Generate local dockerfile
./generate_local_dockerfile.sh

set -xe

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
