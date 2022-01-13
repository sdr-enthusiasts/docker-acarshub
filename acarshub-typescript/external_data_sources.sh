#!/bin/bash

curl https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json > ../rootfs/webapp/data/ground-stations.json || exit 1
curl https://raw.githubusercontent.com/airframesio/data/master/json/acars/metadata.json > ../rootfs/webapp/data/acars-metadata.json || exit 1