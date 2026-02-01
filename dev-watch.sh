#!/usr/bin/env bash

# Development watch script for ACARS Hub
# This script watches for changes in the TypeScript frontend and automatically
# rebuilds and copies the assets to the Flask static directory

set -e

pushd acarshub-react || exit 1
echo "Starting development watch for ACARS Hub frontend..."

npm run dev

popd || exit 1
