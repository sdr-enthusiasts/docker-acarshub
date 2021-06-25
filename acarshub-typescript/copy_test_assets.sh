#!/bin/bash

rm -f ../rootfs/webapp/static/images/*hour.png
rm -f ../rootfs/webapp/static/images/*hours.png
rm -f ../rootfs/webapp/static/images/*days.png
rm -f ../rootfs/webapp/static/images/*week.png
rm -f ../rootfs/webapp/static/images/*months.png
rm -f ../rootfs/webapp/static/images/*year.png

cp  test_assets/images/* ../rootfs/webapp/static/images/
