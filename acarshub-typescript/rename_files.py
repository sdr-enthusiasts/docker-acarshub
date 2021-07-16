#!/usr/bin/env python3

# I'm doing this in python because I cannot stand the idea of doing this in bash.

import os
import sys
import datetime
import fileinput
import hashlib
import re

filenames = {}


def rename_files(path):
    global filenames
    if path is None:
        return

    for root, directories, files in os.walk(path, topdown=False):
        for name in files:
            rename = False
            if name.endswith(".js"):
                rename = True
                hash_name = hashlib.md5(
                    open(os.path.join(root, name), "rb").read()
                ).hexdigest()
                new_name = name.replace(".js", f".{hash_name}.js")
            elif name.endswith(".css"):
                rename = True
                hash_name = hashlib.md5(
                    open(os.path.join(root, name), "rb").read()
                ).hexdigest()
                new_name = name.replace(".css", f".{hash_name}.css")
            if rename:
                filenames[name] = new_name
                os.rename(os.path.join(root, name), os.path.join(root, new_name))
    print(filenames)


def replace_file_names(path):
    global filenames
    print("yo", path)
    with fileinput.input(path, inplace=True) as f:
        for line in f:
            if ".js" in line:
                old_name = re.search(r"/.+\.js", line).group(0)
                old_name = old_name.split("/")[-1]
                if old_name in filenames:
                    new_name = old_name.replace(
                        old_name, f'{filenames[old_name].replace(".js", "")}.js'
                    )
                    line = line.replace(old_name, new_name)
            elif ".css" in line:
                old_name = re.search(r"\/.+\.css", line).group(0)
                old_name = old_name.split("/")[-1]
                if old_name in filenames:
                    new_name = old_name.replace(
                        old_name, f'{filenames[old_name].replace(".css", "")}.css'
                    )
                    line = line.replace(old_name, new_name)

            print(line, end="")


try:
    now = datetime.datetime.now().timestamp()

    print("Renaming ACARS Hub web files for caching")
    rename_files(r"./webapp/static/js")
    rename_files(r"./webapp/static/css")
    print("Changing ACARS Hub web paths for renamed files")
    replace_file_names(r"./webapp/templates/index.html")

    sys.exit(0)
except Exception as e:
    print(e)
    sys.exit(1)
