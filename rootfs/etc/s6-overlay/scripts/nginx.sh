#!/command/with-contenv bash
#shellcheck shell=bash

if [[ $((MIN_LOG_LEVEL)) -ge 4 ]]; then
    # shellcheck disable=SC2016
    s6wrap --quiet --prepend=nginx --timestamps --args echo "Starting web proxy service"
fi

# set listen port, defaults to 80 via Dockerfile
sed -i -e "s/ACARSHUB_NGINX_PORT/${ACARSHUB_NGINX_PORT}/" /etc/nginx.acarshub/sites-enabled/acarshub


# disable IPv6 listen when there is no IPv6 loopback address
if ! ip a | grep -q -e 'inet6 ::1'; then
    sed -i -e 's/listen \[::\].*/# IPv6 disabled/' /etc/nginx.acarshub/sites-enabled/acarshub
fi


# shellcheck disable=SC2016
mkdir -p /var/log/nginx
# shellcheck disable=SC2016
exec \
    s6wrap --quiet --prepend=nginx --timestamps --args /usr/sbin/nginx -c /etc/nginx.acarshub/nginx.conf
