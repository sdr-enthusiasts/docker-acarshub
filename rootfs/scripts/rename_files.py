#!/usr/bin/env python3

# I'm doing this in python because I cannot stand the idea of doing this in bash.

import os
import sys
import datetime
import fileinput


def rename_files(path, now):
    if path is None:
        return

    for root, directories, files in os.walk(path, topdown=False):
        for name in files:
            rename = False
            if name.endswith(".js"):
                rename = True
                new_name = name.replace(".js", f".{now}.js")
            elif name.endswith(".css"):
                rename = True
                new_name = name.replace(".css", f".{now}.css")
            if rename:
                os.rename(os.path.join(root, name), os.path.join(root, new_name))


def replace_file_names(path, now):
    with fileinput.input(path, inplace=True) as f:
        for line in f:
            if ".js" in line:
                line = line.replace(".js", f".{now}.js")
            elif ".css" in line:
                line = line.replace(".css", f".{now}.css")

            print(line, end="")


try:
    now = datetime.datetime.now().timestamp()

    print("Renaming ACARS Hub web files for caching")
    rename_files(r"/webapp/static/js", now)
    rename_files(r"/webapp/static/css", now)
    print("Changing ACARS Hub web paths for renamed files")
    replace_file_names(r"/webapp/templates/index.html", now)

    sys.exit(0)
except Exception as e:
    print(e)
    sys.exit(1)
