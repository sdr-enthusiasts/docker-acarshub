# Install NPM stuff

## Intro

ACARS Hub is written in python, Typescript, HTML and CSS. It uses node so that the typescript compiler can check everything makes sense; however the generated output files aren't appropriate for running on a non-node web server like we're running so all of the output files are fixed after TS build to be appropriate for running on a web server.

There are two modes for running ACARS Hub in testing. For rapid prototyping you will need to run ACARS Hub on your local machine. Please see the sections concerning compiling the typescript and running tests outside of docker below.

If you wish to test inside of a docker container please see the section concerning compiling a local copy of the container.

## System setup

### Mac

Pre-requisites:

- [brew](https://brew.sh)
- XCode
- Cloned ACARS Hub repository
- Python modules from `requirements.txt` installed

```shell
#!/bin/bash
brew install node pre-commit
pushd acarsgitpath/acarshub-typescript
npm install i
popd
pushd acarsgitpath/rootfs/webapp
python3 -m pip install requirements.txt
```

Please note that if you are running on a Mac the installation of requirements.txt will fail because `rrdtool` will not install. Remove it from `requirements.txt` temporarily to get the installation done.

## Compiling the typescript / moving test files in to place

If you want to run ACARS Hub locally you need to compile everything and move the files in to place.

```shell
cd acarsgitpath/acarshub-typescript
npm run buildtest && npm run installer
```

The package.json file in the acarshub-typescript directory will list all of the valid build commands. Right now ACARS Hub is set up to have separate testing and production build targets (`npm run buildtest` and `npm run buildprod` respectively) but as of right now the outputted code is the same. Just building the files does not move the files in to place for running locally. `npm run installer` will move all of the build files in to `rootfs/webapp/static` so that ACARS Hub on your machine will have all of the same files that the build container would have.

## Compiling a local copy of the container

Building locally utilizes cached build components in order to speed up the build process, and as such a modified Dockerfile is generated from the main Dockerfile. It is important to note that if you wish to make changes to the Dockerfile that you intend to merge back to github you need to modify `Dockerfile` and not `Dockerfile.local`. When you run the command below a new version of `Dockerfile.local` is generated based on the changes made to the main Dockerfile.

```shell
cd acars_git_path/
./build-test-no-cluster.sh
```

## Running tests outside of docker

### Copy over test assets

Some files are generated in the container at run time and not present if you run outside of docker. To copy those over

```shell
cd acarsgitpath/acarshub-typescript
npm run copy_test
```

### Using Live Data

Pre-requisites:

- A running version of ACARS Hub is required to provide the ACARS/VDLM source. You could also emulate what ACARS Hub does with vdlm2dec and acarsdec + acars/vdlm_server.
- A valid aircraft.json source. Recommend Mike Nye's tar1090 container

```shell
cd acars_git_path/rootfs/webapp
env ACARSHUB_DB=sqlite:////pathwhereyouwantyourdbsaved.sqlite SPAM=True ENABLE_ACARS=True FREQS_ACARS="130.025;130.450;131.125;131.550" ENABLE_ADSB=true ADSB_URL=ipforyourtar1090instance ADSB_BYPASS_URL=true LIVE_DATA_SOURCE=ipforyouracarssource ADSB_LAT=yourlat ADSB_LON=-yourlon ENABLE_VDLM=true FREQS_VDLM="135.0" python3 application.py
```

`SPAM` env variable disables a few features in ACARS Hub (namely some socket settings that caused problems and the rrd python because that build fails on Mac...)

`LIVE_DATA_SOURCE` changes the IP address that the acars hub server looks for live data at.

### Using the spammer

The message spammer is used to send known messages to ACARS Hub. Useful for testing issues with specific kinds/types of messages. Keep in mind that the spammer doesn't listen on two sockets so enable only VDLM or ACARS, but not both.

```shell
python3 tools/spammer.py options here...see tools/spammer.py for options
```

```shell
cd acars_git_path/rootfs/webapp
env ACARSHUB_DB=sqlite:////pathwhereyouwantyourdbsaved.sqlite SPAM=True ENABLE_ACARS=True FREQS_ACARS="130.025;130.450;131.125;131.550" ADSB_URL=ipforyourtar1090instance ADSB_BYPASS_URL=true python3 application.py
```

## Other useful testing options

### ENV

- `DEBUG_LOGGING=True` makes ACARS Hub really noisy in the logs
