#!/usr/bin/env sh
#shellcheck shell=sh

set -xe

REPO=fredclausen
IMAGE=acarshub
# PLATFORMS="linux/arm64,linux/arm/v6,linux/arm/v7"

# docker context use default
# export DOCKER_CLI_EXPERIMENTAL="enabled"
# docker buildx use cluster

# Generate local dockerfile
./generate_local_dockerfile.sh

#  move the local built copy of airframes out of rootfs
mv rootfs/webapp/static/airframes-acars-decoder .

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
