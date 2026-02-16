#!/command/with-contenv bash
# shellcheck shell=bash

# Source ACARS common functions
# shellcheck disable=SC1091
# shellcheck source=/scripts/acars_common
source /scripts/acars_common

# create the /run/acars dir
mkdir -p /run/acars/

# Ensure /database dir is present

mkdir -p /database/images/static/images

# Ensure stats files are present
touch /database/vdlm2.past5min.json
touch /database/acars.past5min.json

exit 0
