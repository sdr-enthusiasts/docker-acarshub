#!/command/with-contenv bash
# shellcheck shell=bash

# Source ACARS common functions
# shellcheck disable=SC1091
# shellcheck source=/scripts/acars_common
source /scripts/acars_common

# create the /run/acars dir
mkdir -p /run/acars/

exit 0
