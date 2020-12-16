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
docker buildx build --no-cache -t "${REPO}/${IMAGE}:test" --compress --push --platform "${PLATFORMS}" ./Dockerfile.local