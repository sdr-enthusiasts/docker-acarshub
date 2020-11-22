#!/usr/bin/env sh
#shellcheck shell=sh

set -xe

REPO=fredclausen
IMAGE=acarshub
PLATFORMS="linux/arm64"

docker context use x86_64
export DOCKER_CLI_EXPERIMENTAL="enabled"
docker buildx use default

# Build & push latest
docker buildx build --no-cache -t "${REPO}/${IMAGE}:test" --compress --push --platform "${PLATFORMS}" .