#!/usr/bin/env sh
#shellcheck shell=sh

set -xe

REPO=fredclausen
IMAGE=acarshub
PLATFORMS="linux/arm64"

docker context use default
export DOCKER_CLI_EXPERIMENTAL="enabled"
docker buildx use cluster

# Build & push latest
./generate_local_dockerfile.sh
docker buildx build -t "${REPO}/${IMAGE}:test" --compress --push --platform "${PLATFORMS}" ./Dockerfile.local