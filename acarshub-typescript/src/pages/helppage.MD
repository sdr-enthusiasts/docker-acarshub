# ACARS Hub About/Help

## About

ACARS Hub is a collaborative, open source effort to easily enable reception of, feeding to [Airframes.io](http://airframes.io), and local viewing of VDLM2/ACARS messages.

There are three main pages you can interact with:

1. `Live Messages`. This page will show you a rolling, constantly updated, list of up to the 50 most recent live messages as they come in. You can filter out messages that do not contain any information (the `Filter Out 'No Text' Messages/Show 'No Text' Messages` link on the right side), as well as pause the page update so you can catch up with messages.
1. `Live Map`. If you have enabled ADSB this link will be available to you. You can see live ADSB targets from your local tar1090 instance, with targets that have ACARS messages highlighted in a circle.
1. `Search Database`. If you want to look for interesting messages from the past you can use this page to have a look. On the right side, the `Most Recent Messages` will provide a look at your messages in chronological order, most recent first. Otherwise, you can use the provided search for to select the field you are interested in searching and the term to look for.
1. `Statistics`. This page will provide an insight in to the data you've collected.
1. `Alerts`. Use this page to provide ACARS Hub words in the message body, flight (aka callsign), tail number or ICAO transponder codes that you want to monitor. Please see the [alerts](#alerts) section below for more information.
1. `System Status`. On the page footer you will find text/link that shows the status of the underlying ACARS Hub system status. If you click on the link you will see a breakdown of each of the components ACARS Hub uses under the hood to get its work done and if there are any problems with it. It is normal for the system to show a fault for ACARS/VDLM receiving messages if you just started the container - give it a minute to see if it starts working. If any other bit shows a fault after container start that means something isn't right. See below for getting help if you get stuck.

## What is ACARS

ACARS is a pretty cool technology and these planes are sending an awful lot of information in a coded way. We are constantly working, along with the folks at [Airframes.io](http://airframes.io), to decode the messages in a more refined, human-readable way. This is an on-going project so expect to see both decoded and non-decoded messages.

We've made an effort to provide a maximum amount of information about the message in a compact, yet readable, way. Below is a list of terms/acronyms used throughout the web app and what they represent.

Not all messages will include every field, but the fields received for that message will be displayed.

1. `To Address` or `From Address`: This is a unique address for the ground station that originated the message (in the case of a `From` message) or the address of the ground station meant to receive the message in the case of an aircraft originated message. If the ground station ID is recognized, we also display the name/location of the station as `To/From Address Station ID`.
1. `ICAO`: This is a unique address for the aircraft that is sending/receiving the message.
1. `F`/`Frequency`: This is the frequency that the message was received on.
1. `M`/`Mode`: A code generally used to indicate the indicated 'country' or intended recipient of the message.
1. `L`/`Label`: A code used to indicate the contents of the message. The list is really long, but common ones indicate a request for airport ATIS, position report, among many many others. On the `Live Message` page there is a menu under `Filter Message Labels` to exclude certain message labels from being shown.
1. `B`/`Block ID`: Used to assist the stations in decoding message.
1. `M#`/`Message Number`: A sequential combination of numbers and letters used to indicate a multi-part message, and what the correct order of the messages is.
1. `R`/`Response`: Used by the sender/transmitter to indicate if the message was received properly, or if re-transmission is necessary.
1. `E`/`Error`: The inclusion of this field on the website indicates the decoder successfully decoded part of a message, but there was an error in at least one field that it wasn't able to decode. The parts of the message that were decoded are displayed, but there will be missing fields.

Additionally, some fields include a tool-tip if they include extra information (such as the `Flight` field if the web app was able to decipher the airline name), or if the field name is abbreviated (such as the `Mode` field), the tool-tip will give the full name of the field.

## General Tips

- On the `Live Message` page press the `p` key on your keyboard to quickly pause/unpause the website updates so you can catch up on messages.
- On the bottom right corner of all pages you will get a little pop-over indicating a message came in that matched one of your alerts. Click on the box to pull up the message to see the contents of it.
- If a page has configuration options there will be a link in the top bar called `Page Settings` where you can adjust options for that page.

## Alerts

To enable ACARS Hub to highlight messages that you may find interesting, please head on over to the `ALERTS` tab to set everything up.

Separate each term in their respective text input box by a `,` (terms are case insensitive) and hit the update button to have ACARS Hub start monitoring for those terms. If you stay on the Alerts page you will see messages pop up that match your terms. On the Live Messages page you will see the message flagged with red text, and if you are on any other page the Alerts link on the top of the page will show a counter of messages that you've missed. If you want a list of curated terms that the community has determined generally indicate an interesting message click on the `Default Alert Values` link on the right side to autofill in those values.

Additionally, you may see messages that are flagged as an alert but are of no interest to you. By inputting words and or phrases in the `Text field to ignore` setting on the `Alerts` Page you will be able to start filtering out messages that match a word or phrase you want alerted, but when that word or phrase is commonly found in combination with another word/phrase are meaningless to you. A typical example would be you want to see messages about `TURBULENCE` but want to ignore messages about `LIGHT TURBULENCE`.

ACARS Hub can also play a sound if your search term(s) are matched. You can toggle the feature on / off by clicking `TURN [ON/OFF] ALERT SOUND` on the right side of the page. If you use Firefox or Chrome, this feature will work without additional configuration. However, Safari by default blocks all auto-play sounds so you will need to head to `Safari - Preferences - Websites - Auto Play` and find your ACARS Hub IP address or domain name in that list, and change the setting to `Allow All Auto-Play`, as illustrated in the image below

![Safari](static/images/safari.png "safari config")

## Feedback / Help

Your feedback has been instrumental in improving this little project from a bare-bones website showing raw data to what it is now, and it is instrumental to guiding future improvements and making it a complete solution for feeding, receiving and viewing ACARS/VDLM data. Please, don't be a stranger on the [Discord](https://discord.gg/sTf9uYF) server and let us know what you think!

Also the [Discord](https://discord.gg/sTf9uYF) server is a great place to get technical assistance in setting up the container or troubleshooting any issues that you might run in to. No question is too simple, everyone is welcome, and there are plenty of great folks around to help out.
