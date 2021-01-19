#!/usr/bin/env sh
#shellcheck shell=sh

set -xe

REPO=fredclausen
IMAGE=acarshub
PLATFORMS="linux/arm64"

docker context use default
export DOCKER_CLI_EXPERIMENTAL="enabled"
docker buildx use cluster

# Generate local dockerfile
./generate_local_dockerfile.sh

# Build airframesio/acars-decoder-typescript
# Copy /src/acars-decoder-typescript.tgz out of image
docker build --file ./Dockerfile.acars-decoder-typescript -t acars-decoder-typescript:latest .
id=$(docker create acars-decoder-typescript:latest)
docker cp "$id":/src/acars-decoder-typescript.tgz - > ./acars-decoder-typescript.tgz
docker rm -v "$id"

# Build & push latest
docker buildx build -f Dockerfile.local -t "${REPO}/${IMAGE}:test" --compress --push --platform "${PLATFORMS}" .

# Clean up
rm ./acars-decoder-typescript.tgz
