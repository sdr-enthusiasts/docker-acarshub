#!/usr/bin/env sh
#shellcheck shell=sh

set -xe

REPO=fredclausen
IMAGE=acarshub
PLATFORMS="linux/amd64,linux/arm/v7,linux/arm/v6,linux/arm64"

docker context use default
export DOCKER_CLI_EXPERIMENTAL="enabled"
docker buildx use cluster

# Build & push latest
docker buildx build -t "${REPO}/${IMAGE}:latest" --compress --push --platform "${PLATFORMS}" .