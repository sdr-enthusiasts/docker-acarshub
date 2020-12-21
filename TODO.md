TODO:
* Prune old entries (maybe in the add_message_from_json method to keep scheduling simple?)
* Query the db method. Will need to figure out thread safe/scoped sessions/sessions so the webapp can call when needed
* Restrict table size for long one line messages
* DB viewer
* Live filtering of messages/Update displayed messages with historical messages after filter update
* Stat generator / display on website
* Maybe tar1090 side by side display w/ messages?
* Flightaware link for flight / IATA to ICAO lookup
* Move generator and listener functions in to own module so that application.py passes tasks off