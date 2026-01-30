#!/command/with-contenv bash
# shellcheck shell=bash

# Source ACARS common functions
# shellcheck disable=SC1091
# shellcheck source=/scripts/acars_common
source /scripts/acars_common

# create the /run/acars dir
mkdir -p /run/acars/

# Check for deprecated 'external' value and warn users
DEPRECATED_VARS_FOUND=false

if [[ ${ENABLE_ACARS,,} =~ external ]]; then
    echo " "
    echo -e "\033[0;31m########################################################\033[0m"
    echo -e "WARNING: ENABLE_ACARS='\033[0;31mexternal\033[0m' is deprecated!"
    echo -e "Please use ENABLE_ACARS=\033[0;32mtrue\033[0m or ENABLE_ACARS=\033[0;32mfalse\033[0m instead."
    echo -e "\033[0;31m########################################################\033[0m"
    echo " "

    DEPRECATED_VARS_FOUND=true
fi

if [[ ${ENABLE_VDLM,,} =~ external ]]; then
    echo " "
    echo -e "\033[0;31m########################################################\033[0m"
    echo -e "WARNING: ENABLE_VDLM='\033[0;31mexternal\033[0m' is deprecated!"
    echo -e "Please use ENABLE_VDLM=\033[0;32mtrue\033[0m or ENABLE_VDLM=\033[0;32mfalse\033[0m instead."
    echo -e "\033[0;31m########################################################\033[0m"
    echo " "

    DEPRECATED_VARS_FOUND=true
fi

if [[ ${ENABLE_HFDL,,} =~ external ]]; then
    echo " "
    echo -e "\033[0;31m########################################################\033[0m"
    echo -e "WARNING: ENABLE_HFDL='\033[0;31mexternal\033[0m' is deprecated!"
    echo -e "Please use ENABLE_HFDL=\033[0;32mtrue\033[0m or ENABLE_HFDL=\033[0;32mfalse\033[0m instead."
    echo -e "\033[0;31m########################################################\033[0m"
    echo " "

    DEPRECATED_VARS_FOUND=true
fi

if [[ ${ENABLE_IMSL,,} =~ external ]]; then
    echo " "
    echo -e "\033[0;31m########################################################\033[0m"
    echo -e "WARNING: ENABLE_IMSL='\033[0;31mexternal\033[0m' is deprecated!"
    echo -e "Please use ENABLE_IMSL=\033[0;32mtrue\033[0m or ENABLE_IMSL=\033[0;32mfalse\033[0m instead."
    echo -e "\033[0;31m########################################################\033[0m"
    echo " "
    DEPRECATED_VARS_FOUND=true
fi

if [[ ${ENABLE_IRDM,,} =~ external ]]; then
    echo " "
    echo -e "\033[0;31m########################################################\033[0m"
    echo -e "WARNING: ENABLE_IRDM='\033[0;31mexternal\033[0m' is deprecated!"
    echo -e "Please use ENABLE_IRDM=\033[0;32mtrue\033[0m or ENABLE_IRDM=\033[0;32mfalse\033[0m instead."
    echo -e "\033[0;31m########################################################\033[0m"
    echo " "
    DEPRECATED_VARS_FOUND=true
fi

if [[ "${DEPRECATED_VARS_FOUND}" == "true" ]]; then
    echo " "
    echo -e "\033[0;31m########################################################\033[0m"
    echo -e "The '\033[0;31mexternal\033[0m' value will be removed in a future release."
    echo -e "Update your configuration to use '\033[0;32mtrue\033[0m' or '\033[0;32mfalse\033[0m'."
    echo -e "\033[0;31m########################################################\033[0m"
    echo " "
fi

# Ensure /database dir is present

mkdir -p /database/images/static/images

# Ensure stats files are present
touch /database/vdlm2.past5min.json
touch /database/acars.past5min.json

exit 0
