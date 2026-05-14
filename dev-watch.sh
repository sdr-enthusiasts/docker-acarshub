#!/usr/bin/env bash

# Development watch script for ACARS Hub
# This script starts the Vite dev server for the React frontend with HMR.
# The Node.js backend (acarshub-backend) is run separately via `just server`.

set -e

pushd acarshub-react || exit 1
echo "Starting development watch for ACARS Hub frontend..."

npm run dev

popd || exit 1
