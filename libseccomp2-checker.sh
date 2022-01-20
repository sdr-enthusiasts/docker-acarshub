#!/bin/bash
#
# This script updates a BUSTER Debian distribution so it will have the latest version of libseccomp2.
# The upgrade is necessary to run Bullseye-based Docker containers on a Buster host system.
#
# Inspired by https://docs.linuxserver.io/faq#option-2 and https://github.com/linuxserver/docker-jellyfin/issues/71#issuecomment-733621693

# Welcome message:
echo "Welcome to the libseccomp2 upgrade script for Buster. This script is meant to be run on Raspberry Pi Buster-based systems that have Docker containers"
echo "that run Debian Bullseye or later. For this, the \"libseccomp2\" library version must be 2.4 or later."
echo "This script will check this, and upgrade the library as necessary."
echo ""
echo "Once upgraded, you can always stay up to date by typing \"sudo apt update && sudo apt upgrade\" on your command line."
echo ""

# Now make sure that all packages are at their latest version, just in case the system is running way behind:
echo "Updating your system with the latest package versions. Please be patient, this may take a while."
sudo apt update -q && sudo apt upgrade -y -q && sudo apt install -y -q bc >/dev/null 2>&1
echo ""

LIBVERSION="$(apt-cache policy libseccomp2|sed -n 's/\s*Installed:\s*\([0-9]*.[0-9]*\).*/\1/p')"
if (( $(echo "$LIBVERSION > 2.3" | bc -l) ))
then
	# No need to update!
    # shellcheck disable=SC2046,SC2027
	echo "You are already running a version of libseccomp2 (v"$(apt-cache policy libseccomp2|sed -n 's/\s*Installed:\s*\(.*\)/\1/p')") that is recent enough. No need to upgrade!"
	exit 0
fi

# Make sure we are indeed running a Debian Buster (Raspberry Pi OS) system:
if ! grep "VERSION_CODENAME=buster" /etc/os-release >/dev/null 2>/dev/null
then
	echo "You aren't running BUSTER. The system reports $(sed -n 's/\(^\s*VERSION_CODENAME=\)\(.*\)/\2/p' /etc/os-release)."
	echo "This script has been optimized for Raspberry Pi OS \"Buster\". Aborting."
	exit 1
fi

echo "Your system is \"buster\" based, and it has libseccomp2 v${LIBVERSION}. Upgrade is recommended."
read -rp "Press ENTER to the upgrade" </dev/tty
echo ""



#Now check once more which version of libseccomp2 is installed:
LIBVERSION="$(apt-cache policy libseccomp2|sed -n 's/\s*Installed:\s*\([0-9]*.[0-9]*\).*/\1/p')"
if (( $(echo "$LIBVERSION < 2.4" | bc -l) ))
then
	# We need to upgrade
	sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 04EE7237B7D453EC 648ACFD622F3D138
	echo "deb http://deb.debian.org/debian buster-backports main" | sudo tee -a /etc/apt/sources.list.d/buster-backports.list
	sudo apt update
	sudo apt install -y -q -t buster-backports libseccomp2
fi
echo "Upgrade complete. Your system now uses libseccomp2 version $(apt-cache policy libseccomp2|sed -n 's/\s*Installed:\s*\(.*\)/\1/p')."
