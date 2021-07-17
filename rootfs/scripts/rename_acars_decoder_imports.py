#!/usr/bin/env python3

# I'm doing this in python because I cannot stand the idea of doing this in bash.

import os
import sys
import datetime
import fileinput
import hashlib
import re

filenames = {}
changed_names = []


def rreplace(s, old, new, occurrence):
    li = s.rsplit(old, occurrence)
    return new.join(li)


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
                new_name = name.replace(".js", f".{hash_name}")
            if rename:
                filenames[name.replace(".js", "")] = new_name
                os.rename(
                    os.path.join(root, name), os.path.join(root, new_name + ".js")
                )
    print(filenames)


def replace_file_names(path):
    global filenames
    global changed_names
    for root, directories, files in os.walk(path, topdown=False):
        for name in files:
            if ".js" in name:
                with fileinput.input(os.path.join(root, name), inplace=True) as f:
                    for line in f:
                        if (
                            "import {" in line
                            or "import *" in line
                            or "export *" in line
                        ):
                            old_name = re.search(r"\.\/.+'", line)
                            if old_name is not None:
                                old_name = old_name.group(0)
                                old_name = old_name.split("/")[-1].replace("'", "")
                                if old_name in filenames:
                                    new_name = old_name.replace(
                                        old_name,
                                        f'{filenames[old_name].replace(".js", "")}',
                                    )
                                    line = rreplace(line, old_name, new_name + ".js", 1)
                                    changed_names.append(old_name + "->" + new_name)
                        print(line, end="")
                    f.close()


try:
    path = "/src/airframes-acars-decoder/package/dist"
    print("Renaming ACARS Hub web files for caching")
    rename_files(path)
    print("Changing ACARS Hub web paths for renamed files")
    replace_file_names(path)
    for line in changed_names:
        print(line)
    sys.exit(0)
except Exception as e:
    print(e)
    sys.exit(1)
