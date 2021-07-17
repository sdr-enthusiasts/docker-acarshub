#!/bin/bash

# generate a local dockerfile for local test builds

rm -f Dockerfile.local
cp Dockerfile Dockerfile.local

#.bu needed on my mac for reasons I don't understand but am going with

# Delete the copy line necessary for github actions
# however, we do need the python requirements copied in, so we'll copy early
# This is a nice convenience for using cached builds

sed -i.bu 's/COPY rootfs\/ \//COPY rootfs\/webapp\/requirements.txt \/webapp\/requirements.txt/g' Dockerfile.local
sed -i.bu '/COPY webapp.tar.gz \/src\/webapp.tar.gz/d' Dockerfile.local
sed -i.bu '/tar -xzvf \/src\/webapp.tar.gz -C \/ && \\/d' Dockerfile.local

# move the COPY FS line back to the bottom so that we can use cached builds
sed -i.bu 's/ENTRYPOINT \[ "\/init" \]/COPY rootfs\/ \/\nCOPY webapp\/ \/webapp\/\nENTRYPOINT \[ "\/init" \]\n/g' Dockerfile.local

# fix the import for Message Decoder
sed -i.bu '/    export INDEX_PATH=\$(ls \/webapp\/static\/js\/index\*.js) && \\/d' Dockerfile.local
sed -i.bu '/    export OLD_MD5=\$(md5sum \$INDEX_PATH | awk -F\x27 \x27 \x27{print \$1\}\x27) && \\/d' Dockerfile.local
sed -i.bu '/    echo \$(basename \/webapp\/static\/airframes-acars-decoder\/MessageDecoder\*.js) | xargs -I \x27{}\x27 sed -i "s\/MessageDecoder.js\/\$(echo {})\/g" \$INDEX_PATH && \\/d' Dockerfile.local
sed -i.bu '/    export NEW_MD5=\$(md5sum \$INDEX_PATH | awk -F\x27 \x27 \x27{print \$1}\x27) && \\/d' Dockerfile.local
sed -i.bu '/    mv \$INDEX_PATH \$(echo \$INDEX_PATH | sed -e "s\/\$OLD_MD5\/\$NEW_MD5\/g") && \\/d' Dockerfile.local
sed -i.bu '/    sed -i "s\/\$(echo \$OLD_MD5)\/\$(echo \$NEW_MD5)\/g" \/webapp\/templates\/index.html && \\/d' Dockerfile.local

# clean up...thanks mac
rm -f Dockerfile.local.bu
