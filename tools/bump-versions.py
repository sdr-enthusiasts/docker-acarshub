#!/usr/bin/env python3

import fileinput
import argparse
import re


def update_version_file(line="", build=False, minor=False, patch=False):
    if line.rstrip() == "":
        return line

    version = re.search(r"v\d+\.\d+\.\d+", line).group()
    major_number = re.search(r"v\d+\.", version).group().replace(".", "")
    minor_number = re.search(r"\.\d+\.", version).group().replace(".", "")
    if minor:
        minor_number = str(int(minor_number) + 1)
    patch_number = re.search(r"(\.\d+$)", version).group().replace(".", "")
    if not minor and patch:
        patch_number = str(int(patch_number) + 1)
    elif patch:
        patch_number = 0
    build_number = re.search(r"\d+$", line).group()
    if build:
        build_number = str(int(build_number) + 1)
    if line.find(" ") != -1:
        space = " "
    else:
        space = ""
    return (
        major_number
        + "."
        + minor_number
        + "."
        + patch_number
        + space
        + "Build"
        + space
        + build_number
    )


def update_package_file(line="", minor=False, patch=False):
    if line.rstrip() == "" or line.find('"version":') == -1:
        return line.rstrip()
    version = re.search(r"\d+\.\d+\.\d+", line).group()
    major_number = re.search(r"\d+\.", version).group().replace(".", "")
    minor_number = re.search(r"\.\d+\.", version).group().replace(".", "")
    if not minor and minor:
        minor_number = str(int(minor_number) + 1)
    elif patch:
        minor_number = 0
    patch_number = re.search(r"(\.\d+$)", version).group().replace(".", "")
    if patch:
        patch_number = str(int(patch_number) + 1)
    return (
        '  "version": "' + major_number + "." + minor_number + "." + patch_number + '",'
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update version of ACARS Hub")

    parser.add_argument(
        "--build", "-b", action="store_true", help="Update the build version"
    )

    parser.add_argument(
        "--minor-version", "-m", action="store_true", help="Update the minor version"
    )

    parser.add_argument(
        "--patch-version", "-p", action="store_true", help="Update the patch version"
    )
    args = parser.parse_args()
    if args.build:
        build = True
    else:
        build = False

    if args.minor_version:
        minor = True
    else:
        minor = False

    if args.patch_version:
        patch = True
    else:
        patch = False

    try:
        # update the acars hub internal version
        with fileinput.input("../version", inplace=True) as f:
            for line in f:
                print(update_version_file(line, build, minor, patch))

        with fileinput.input("../acarshub-typescript/package.json", inplace=True) as f:
            for line in f:
                print(update_package_file(line, minor, patch))
    except Exception as e:
        print(e)
