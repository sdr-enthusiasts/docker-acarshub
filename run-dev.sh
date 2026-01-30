#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    echo "Loading environment variables from .env..."
    export $(grep -v '^#' .env | xargs)
else
    echo "Warning: .env file not found!"
    echo "Copy .env.example to .env and configure it."
    exit 1
fi

# Run the Flask development server
echo "Starting ACARS Hub development server..."
python rootfs/webapp/acarshub.py
