#!/bin/bash

rm -f ../rootfs/webapp/images/*hour.png
rm -f ../rootfs/webapp/images/*hours.png
rm -f ../rootfs/webapp/images/*days.png
rm -f ../rootfs/webapp/images/*week.png
rm -f ../rootfs/webapp/images/*months.png
rm -f ../rootfs/webapp/images/*year.png

cp  test_assets/images/* ../rootfs/webapp/images/

rm -f ../rootfs/webapp/data/ground-stations.json
rm -f ../rootfs/webapp/data/acars-metadata.json

curl https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json > ../rootfs/webapp/data/ground-stations.json
curl https://raw.githubusercontent.com/airframesio/data/master/json/acars/metadata.json > ../rootfs/webapp/data/acars-metadata.json
