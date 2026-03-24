#!/command/with-contenv bash
#shellcheck shell=bash

if [[ $((MIN_LOG_LEVEL)) -ge 4 ]]; then
    # shellcheck disable=SC2016
    s6wrap --quiet --prepend=webapp --timestamps --args echo "Starting web service (Node.js)"
fi

cd /backend || exit 1

# shellcheck disable=SC2016
exec s6wrap --quiet --prepend=webapp --timestamps --args node server.bundle.mjs
