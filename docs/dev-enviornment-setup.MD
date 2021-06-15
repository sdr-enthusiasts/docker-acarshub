# Install NPM stuff

## System setup

### Mac

Pre-requisites:

* [brew](https://brew.sh)
* XCode
* Cloned ACARS Hub repository

```shell
brew install node pre-commit
cd acarsgitpath/acarshub-typescript
npm install i
```

## Compiling the typescript / moving test files in to place

```shell
cd acarsgitpath/acarshub-typescript
npm run buildtest && npm run installer
```

## Running tests outside of docker

### Using Live Data

Pre-requisites:

* A running version of ACARS Hub is required to provide the ACARS/VDLM source. You could also emulate what ACARS Hub does with vdlm2dec and acarsdec + acars/vdlm_server.
* A valid aircraft.json source. Recommend Mike Nye's tar1090 container

```shell
cd acars_git_path/rootfs/webapp
env ACARSHUB_DB=sqlite:////pathwhereyouwantyourdbsaved.sqlite SPAM=True ENABLE_ACARS=True FREQS_ACARS="130.025;130.450;131.125;131.550" ENABLE_ADSB=true ADSB_URL=ipforyourtar1090instance LIVE_DATA_SOURCE=ipforyouracarssource ADSB_LAT=yourlat ADSB_LON=-yourlon ENABLE_VDLM=true FREQS_VDLM="135.0" python3 application.py
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
env ACARSHUB_DB=sqlite:////pathwhereyouwantyourdbsaved.sqlite SPAM=True ENABLE_ACARS=True FREQS_ACARS="130.025;130.450;131.125;131.550" python3 application.py
```

## Other useful testing options

### ENV

* `DEBUG_LOGGING=True` makes ACARS Hub really noisy in the logs
