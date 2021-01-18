###ACARS Hub About/Help

####About

ACARS Hub is a collaborative, open source effort to easily enable reception of, feeding to [Airframes.io](airframes.io), and local viewing of VDLM2/ACARS messages.

There are three main pages you can interact with:

1. `Live Messages`. This page will show you a rolling, constantly updated, list of up to the 50 most recent live messages as they come in. You can filter out messages that do not contain any information (the `Filter Out 'No Text' Messages/Show 'No Text' Messages` link on the right side), as well as pause the page update so you can catch up with messages.

2. `Search Database`. If you want to look for interesting messages from the past you can use this page to have a look. On the right side, the `Most Recent Messages` will provide a look at your messages in chronological order, most recent first. Otherwise, you can use the provided search for to select the field you are interested in searching and the term to look for.

3. `Statistics`. This page will provide an insight in to the data you've collected.

---

ACARS is a pretty cool technology and these planes are sending an awful lot of information in a coded way. We are constantly working, along with the folks at [Airframes.io](airframes.io), to decode the messages in a more refined, human-readable way. This is an on-going project so expect to see both decoded and non-decoded messages.

We've made an effort to provide a maximum amount of information about the message in a compact, yet readable, way. Below is a list of terms/acronyms used throughout the web app and what they represent. 

Not all messages will include every field, but the fields received for that message will be displayed.

4. `To Address` or `From Address`: This is a unique address for the ground station that originated the message (in the case of a `From` message) or the address of the ground station meant to receive the message in the case of an aircraft originated message. If the ground station ID is recognized, we also display the name/location of the station as `To/From Address Station ID`.

5. `ICAO`: This is a unique address for the aircraft that is sending/receiving the message.

6. `F`/`Frequency`: This is the frequency that the message was received on.

7. `M`/`Mode`: A code generally used to indicate the indicated 'country' or intended recipient of the message.

8. `L`/`Label`: A code used to indicate the contents of the message. The list is really long, but common ones indicate a request for airport ATIS, position report, among many many others.

9. `B`/`Block ID`: Used to assist the stations in decoding message.

10. `M#`/`Message Number`: A sequential combination of numbers and letters used to indicate a multi-part message, and what the correct order of the messages is.

11. `R`/`Response`: Used by the sender/transmitter to indicate if the message was received properly, or if re-transmission is necessary.

12. `E`/`Error`: The inclusion of this field on the website indicates the decoder successfully decoded part of a message, but there was an error in at least one field that it wasn't able to decode. The parts of the message that were decoded are displayed, but there will be missing fields.

Additionally, some fields include a tool-tip if they include extra information (such as the `Flight` field if the web app was able to decipher the airline name), or if the field name is abbreviated (such as the `Mode` field), the tool-tip will give the full name of the field.

####Feedback / Help

Your feedback has been instrumental in improving this little project from a bare-bones website showing raw data to what it is now, and it is instrumental to guiding future improvements and making it a complete solution for feeding, receiving and viewing ACARS/VDLM data. Please, don't be a stranger on the [Discord](https://discord.gg/sTf9uYF) server and let us know what you think!