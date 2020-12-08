#!/usr/bin/env bash

# Fail on error
set -e

# Remove source files if exist
rm /run/acars/acars.json > /dev/null 2>&1 || true
rm /run/acars/vdlm.json > /dev/null 2>&1 || true

echo "Preparing spoofed input files"

# Prepare spoofed /run/acars/acars.json
for i in {1..5}; do echo "acars $i" >> /run/acars/acars.json; done

# Prepare spoofed /run/acars/vdlm.json
for i in {1..5}; do echo "vdlm $i" >> /run/acars/vdlm.json; done

# Run line_trim.sh
echo "Running /scripts/line_trim.sh"
bash -e /scripts/line_trim.sh

# Check for expected output, if grep finds nothing it will exit 1 which
# will cause the script to fail (set -e)
echo "Ensuring correct output"
for i in {1..5}; do
    grep "acars $i" /var/www/html/display.json > /dev/null 2>&1
    grep "vdlm $i" /var/www/html/display.json > /dev/null 2>&1
done

# Remove source files if exist
rm /run/acars/acars.json > /dev/null 2>&1 || true
rm /run/acars/vdlm.json > /dev/null 2>&1 || true

echo "Preparing large spoofed input files"

# Prepare large spoofed /run/acars/acars.json
for i in {1..5000}; do echo "acars $i" >> /run/acars/acars.json; done

# Prepare large spoofed /run/acars/vdlm.json
for i in {1..5000}; do echo "vdlm $i" >> /run/acars/vdlm.json; done

# Run line_trim.sh
echo "Running /scripts/line_trim.sh"
bash -e /scripts/line_trim.sh

# Ensure limited to 200 lines
echo "Ensuring display.json is limited to 200 lines"
if [[ "$(wc -l < /var/www/html/display.json)" -gt 200 ]]; then
    exit 1
fi

echo "Tests succeeded!"
exit 0