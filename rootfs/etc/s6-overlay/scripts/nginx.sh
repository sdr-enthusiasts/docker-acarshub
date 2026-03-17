#!/command/with-contenv bash
#shellcheck shell=bash

if [[ $((MIN_LOG_LEVEL)) -ge 4 ]]; then
    # shellcheck disable=SC2016
    s6wrap --quiet --prepend=nginx --timestamps --args echo "Starting web proxy service"
fi

# shellcheck disable=SC2016
mkdir -p /var/log/nginx
# shellcheck disable=SC2016
exec \
    s6wrap --quiet --prepend=nginx --timestamps --args /usr/sbin/nginx -c /etc/nginx.acarshub/nginx.conf
