#!/usr/bin/env bash

rm -f ../rootfs/webapp/static/images/*hour.png
rm -f ../rootfs/webapp/static/images/*hours.png
rm -f ../rootfs/webapp/static/images/*days.png
rm -f ../rootfs/webapp/static/images/*week.png
rm -f ../rootfs/webapp/static/images/*months.png
rm -f ../rootfs/webapp/static/images/*year.png

cp test_assets/images/* ../rootfs/webapp/static/images/

rm -f ../rootfs/webapp/data/ground-stations.json
rm -f ../rootfs/webapp/data/metadata.json

curl https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json > ../rootfs/webapp/data/ground-stations.json
curl https://raw.githubusercontent.com/airframesio/data/master/json/acars/metadata.json > ../rootfs/webapp/data/metadata.json
