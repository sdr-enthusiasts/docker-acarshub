# ARM-32

After March 1st, 2022 32 bit Raspberry Pi, Buster Based OS machines may not run ACARS Hub properly. I will be updating the base image of the container to Debian Bullseye and this will cause ACARS Hub to cease working if you are not prepared. This is necessary to ensure ACARS Hub continues to receive bug fixes and timely security updates in installed packages.

The issue with Buster based systems involves a very outdated system package called `libseccomp2`. Using recent docker base images requires a more up-to-date `libseccomp2` that is not typically available without extra steps.

You have four options to ensure ACARS Hub will work on your Pi.

* Update `libseccomp2` in your Raspberry OS Install.
* A fresh install of Raspberry Pi OS 1.4 (Bullseye based), or an install of Raspberry Pi OS from an image made after November 2021.
* Use Ubuntu ARM 64 bit
* Run ACARS Hub with the `priviledged` flag. **SECURITY ISSUE: NOT RECOMMENDED**

[KX1T](https://github.com/kx1t) has created a [script](libseccomp2-checker.sh) that you can run that will check your system and ensure it is ready. This script will only work on buster-based debian distros and will only change anything if your libseccomp2 is outdated.

The libseccomp2 script will do the following things to your system if the version of libseccomp2 is outdated:

* Add an official Debian repository to your apt sources along with the associated GPG key
* Update your system packages prior to updating libseccomp2
* Finally, install libseccomp2

You may be prompted for a password because the script is modifying things that require escalated priviledges.

To run this script, which only needs to be done once, please do the following

```shell
curl -sL https://raw.githubusercontent.com/fredclausen/docker-acarshub/main/libseccomp2-checker.sh | bash
```
