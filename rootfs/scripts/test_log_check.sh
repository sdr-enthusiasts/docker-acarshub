#!/usr/bin/env bash

# Fail on error
set -e

# Remove source files if exist
rm /run/acars/acars.json > /dev/null 2>&1 || true
rm /run/acars/vdlm.json > /dev/null 2>&1 || true

echo "Preparing spoofed input files"

# Prepare spoofed /run/acars/acars.json
for i in {1..5000}; do echo "acars $i" >> /run/acars/acars.json; done

# Prepare spoofed /run/acars/vdlm.json
for i in {1..5000}; do echo "vdlm $i" >> /run/acars/vdlm.json; done

# Run line_trim.sh
echo "Running /scripts/log_check.sh"
bash -e /scripts/log_check.sh

# Check for expected output, if grep finds nothing it will exit 1 which
# will cause the script to fail (set -e)
echo "Ensuring correct output"
head -1 /run/acars/acars.json | grep 'acars 4001'
head -1 /run/acars/vdlm.json | grep 'vdlm 4001'
tail -1 /run/acars/acars.json | grep 'acars 5000'
tail -1 /run/acars/vdlm.json | grep 'vdlm 5000'

echo "Tests succeeded!"
exit 0
