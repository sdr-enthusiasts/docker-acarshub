#!/bin/bash

REPO=ghcr.io/sdr-enthusiasts
IMAGE=docker-acarshub

# # Generate local dockerfile
# ./generate_local_dockerfile.sh

set -xe

cleanup() {
  echo "Cleaning up"
  rm -rf ./webapp
  echo "Done. Exiting."
  exit 0
}

# build the acarshub typescript
echo "Building the typescript"
docker build --file ./Dockerfile.acarshub-typescript -t acarshub-typescript:latest . || cleanup
echo "Done building the typescript, grabbing the files from the container"
id=$(docker create acarshub-typescript:latest) || cleanup
docker cp "$id":/rootfs/webapp ./ || cleanup
echo "Done grabbing the files from the container, removing the container"
docker rm -v "$id" || cleanup
echo "Done removing the container"
sleep 3

# Generate local dockerfile
echo "Generating the local dockerfile"
./generate_local_dockerfile.sh || cleanup
echo "Done generating the local dockerfile"

# Build & push latest
echo "Building the docker image"
docker build -f Dockerfile.acarshub.local -t "${REPO}/${IMAGE}:test-local" . || cleanup
echo "Done building the docker image, pushing the docker image"

# Clean up
cleanup
