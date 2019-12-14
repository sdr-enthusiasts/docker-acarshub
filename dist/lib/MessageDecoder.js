"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Plugins = require("./plugins/official");
var MessageDecoder = /** @class */ (function () {
    function MessageDecoder() {
        this.plugins = [];
        this.registerPlugin(new Plugins.LabelColonComma(this));
        this.registerPlugin(new Plugins.Label5Z(this));
        this.registerPlugin(new Plugins.Label15(this));
        this.registerPlugin(new Plugins.LabelH1_M1BPOS(this));
        this.registerPlugin(new Plugins.Label80(this));
        this.registerPlugin(new Plugins.LabelSQ(this));
    }
    MessageDecoder.prototype.registerPlugin = function (plugin) {
        var pluginInstance = plugin;
        // plugin.onRegister(this.store);
        this.plugins.push(plugin);
        return true;
    };
    MessageDecoder.prototype.decode = function (message) {
        console.log('All plugins');
        console.log(this.plugins);
        var usablePlugins = this.plugins.filter(function (plugin) {
            var qualifiers = plugin.qualifiers();
            if (qualifiers.labels.includes(message.label)) {
                if (qualifiers.preambles && qualifiers.preambles.length > 0) {
                    var matching = qualifiers.preambles.filter(function (preamble) {
                        console.log(message.text.substring(0, preamble.length));
                        console.log(preamble);
                        return message.text.substring(0, preamble.length) === preamble;
                    });
                    console.log(matching);
                    return matching.length >= 1;
                }
                else { // eslint-disable-line no-else-return
                    return true;
                }
            }
            return false;
        });
        console.log('Usable plugins');
        console.log(usablePlugins);
        var result;
        if (usablePlugins.length > 0) {
            var plugin = usablePlugins[0];
            result = plugin.decode(message);
        }
        else {
            result = {
                decoded: false,
                decodeLevel: 'none',
                error: 'No known decoder plugin for this message',
                remaining: {
                    text: message.text,
                },
            };
        }
        console.log('Result');
        console.log(result);
        return result;
    };
    MessageDecoder.prototype.decodeMessage = function (message) {
        var decodedString = '';
        if (message.label === ':;') {
            decodedString += '<div>Aircraft Transceiver Frequency Change</div>';
            var frequency = Number(message.text) / 1000;
            decodedString += frequency + " MHz";
        }
        if (message.label === '15') {
            // General Aviation Position Report
            decodedString += '<div>Position Report</div>';
            var twoZeeRegex = /^\(2(?<between>.+)\(Z$/;
            var results = message.text.match(twoZeeRegex);
            if (results) {
                // Style: (2N38111W 82211266 76400-64(Z
                console.log("Label 15 Position Report: between = " + results.groups.between);
            }
        }
        if (message.label === '5Z') {
            decodedString += '<div>Airline Designated Downlink</div>';
            var uaRegex = /^\/(?<type>\w+) (?<remainder>.+)/;
            var results = message.text.match(uaRegex);
            if (results && results.length >= 2) {
                // Successful match: United Airlines 5Z message
                var type = results.groups.type.split('/')[0];
                var remainder = results.groups.remainder;
                console.log(results);
                console.log("DECODER: Matched 'United Airlines 5Z': type = " + type + ", remainder = " + remainder);
                var typeDescription = void 0;
                switch (type) {
                    case 'B1':
                        typeDescription = 'Request Weight and Balance';
                        break;
                    case 'B3':
                        typeDescription = 'Request Departure Clearance';
                        break;
                    case 'CD':
                        typeDescription = 'Weight and Balance';
                        break;
                    case 'CG':
                        typeDescription = 'Request Pre-departure clearance, PDC';
                        break;
                    case 'CM':
                        typeDescription = 'Crew Scheduling';
                        break;
                    case 'C3':
                        typeDescription = 'Off Message';
                        break;
                    case 'C4':
                        typeDescription = 'Flight Dispatch';
                        break;
                    case 'C5':
                        typeDescription = 'Maintenance Message';
                        break;
                    case 'C6':
                        typeDescription = 'Customer Service';
                        break;
                    case '10':
                        typeDescription = 'PIREP';
                        break;
                    case 'C11':
                        typeDescription = 'International PIREP';
                        break;
                    case 'DS':
                        typeDescription = 'Late Message';
                        break;
                    case 'D3':
                        typeDescription = 'Holding Pattern Message';
                        break;
                    case 'D6':
                        typeDescription = 'From-To + Date';
                        break;
                    case 'D7':
                        typeDescription = 'From-To + Alternate + Time';
                        break;
                    case 'EO':
                        typeDescription = 'In Range';
                        break;
                    case 'PW':
                        typeDescription = 'Position Weather';
                        break;
                    case 'RL':
                        typeDescription = 'Request Release';
                        break;
                    case 'R3':
                        typeDescription = 'Request HOWGOZIT Message';
                        break;
                    case 'R4':
                        typeDescription = 'Request the Latest POSBD';
                        break;
                    case 'TC':
                        typeDescription = 'From-To Fuel';
                        break;
                    case 'WB':
                        typeDescription = 'From-To';
                        break;
                    case 'W1':
                        typeDescription = 'Request Weather for City';
                        break;
                    default:
                        typeDescription = 'Unknown';
                }
                decodedString += '<div>Airline: United Airlines</div>';
                decodedString += "<div>Message Type: " + typeDescription + " (" + type + ")</div>";
                if (type === 'B3') {
                    var rdcRegex = /^(?<from>\w\w\w)(?<to>\w\w\w) (?<unknown1>\d\d) R(?<runway>.+) G(?<unknown2>.+)$/; // eslint-disable-line max-len
                    results = remainder.match(rdcRegex);
                    if (results) {
                        decodedString += "<div>Origin: " + results.groups.from + "</div>";
                        decodedString += "<div>Destination: " + results.groups.to + "</div>";
                        decodedString += "<div>Unknown Field 1: " + results.groups.unknown1 + "</div>";
                        decodedString += "<div>Runway: " + results.groups.runway + "</div>";
                        decodedString += "<div>Unknown FIeld 2: " + results.groups.unknown2 + "</div>";
                    }
                    else {
                        console.log("Unkown 5Z RDC format: " + remainder);
                    }
                }
                else {
                    decodedString += "<div>Remainder: " + remainder + " (Will analyze and decode in the future)</div>";
                }
            }
            else {
                // Unknown
                console.log("Unknown 5Z message: " + message.text);
            }
        }
        if (message.label === '80') {
            // Airline Defined
            decodedString += '<div>Airline Defined</div>';
            var parts = message.text.split('\n');
            console.log(parts);
            if (parts[0].substr(0, 11) === '3N01 POSRPT') {
                // 3N01 POSRPT
                var posRptRegex = /^3N01 POSRPT \d\d\d\d\/\d\d (?<orig>\w+)\/(?<dest>\w+) \.(?<tail>[\w-]+)(\/(?<agate>.+) (?<sta>\w+:\w+))*/; // eslint-disable-line max-len
                var results = parts[0].match(posRptRegex);
                if (results && results.length > 0) {
                    // This implementation with embedded HTML is temporary
                    console.log('DECODER: 3N01 POSRPT match');
                    decodedString += '<div class="mb-2">Position Report</div>';
                    decodedString += '<table class="table table-sm table-bordered">';
                    decodedString += "<tr><td>Origin</td><td>" + results.groups.orig + "</td></tr>";
                    decodedString += "<tr><td>Destination</td><td>" + results.groups.dest + "</td></tr>";
                    decodedString += "<tr><td>Tail</td><td>" + results.groups.tail + "</td></tr>";
                    if (results.groups.agate) {
                        decodedString += "<tr><td>Arrival Gate</td><td>" + results.groups.agate + "</td></tr>";
                        decodedString += "<tr><td>Scheduled Time of Arrival (STA)</td><td>" + results.groups.sta + "</td></tr>";
                    }
                    posRptRegex = /\/(?<field>\w+)\s(?<value>[\w\+\-:\.^\s]+)/g; // eslint-disable-line no-useless-escape
                    var remainingParts = parts.slice(1);
                    for (var _i = 0, remainingParts_1 = remainingParts; _i < remainingParts_1.length; _i++) { // eslint-disable-line no-restricted-syntax
                        var part = remainingParts_1[_i];
                        results = part.matchAll(posRptRegex);
                        console.log(results);
                        if (results) {
                            for (var _a = 0, results_1 = results; _a < results_1.length; _a++) { // eslint-disable-line no-restricted-syntax
                                var result = results_1[_a];
                                switch (result.groups.field) {
                                    case 'ALT': {
                                        decodedString += "<tr><td>Altitude (" + result.groups.field + ")</td><td>" + result.groups.value + " feet</td></tr>";
                                        break;
                                    }
                                    case 'DWND': {
                                        decodedString += "<tr><td>Unknown (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    }
                                    case 'ETA':
                                        decodedString += "<tr><td>Estimated Time of Arrival (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    case 'FOB':
                                        decodedString += "<tr><td>Fuel on Board (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    case 'FL':
                                        decodedString += "<tr><td>Flight Level (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    case 'HDG':
                                        decodedString += "<tr><td>Heading (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    case 'MCH':
                                        decodedString += "<tr><td>Aircraft Speed (" + result.groups.field + ")</td><td>" + result.groups.value + " mach</td></tr>";
                                        break;
                                    case 'NWYP':
                                        decodedString += "<tr><td>Unknown (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    case 'POS': {
                                        var posRegex = /^(?<latd>[NS])(?<lat>.+)(?<lngd>[EW])(?<lng>.+)/;
                                        var posResult = result.groups.value.match(posRegex);
                                        decodedString += "<tr><td>Position (" + result.groups.field + ")</td><td>" + (Number(posResult.groups.lat) / 100).toPrecision(5) + " " + posResult.groups.latd + ", " + (Number(posResult.groups.lng) / 100).toPrecision(5) + " " + posResult.groups.lngd + "</td></tr>";
                                        break;
                                    }
                                    case 'SAT':
                                        decodedString += "<tr><td>Static Air Temperature (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    case 'SWND':
                                        decodedString += "<tr><td>Unknown (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    case 'TAS':
                                        decodedString += "<tr><td>True Airspeed (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                        break;
                                    default:
                                        decodedString += "<tr><td>Unknown (" + result.groups.field + ")</td><td>" + result.groups.value + "</td></tr>";
                                }
                            }
                        }
                    }
                    decodedString += '</table>';
                }
            }
        }
        if (message.label === 'H1') {
            if (message.text.includes('#M1BPOS')) {
                console.log('DECODER: #M1BPOS detected');
                var parts = message.text.replace('#M1BPOS', '').split('/')[0].split(',');
                // console.log(parts);
                decodedString += '<div>Position Report</div>';
                var coordsRegex = /(?<lac>[NS])(?<la>\d+)(?<lnc>[EW])(?<ln>\d+)/;
                var results = parts[0].match(coordsRegex);
                // console.log(results);
                if (results && results.length >= 4) {
                    var latitude = results.groups.la / 1000;
                    var longitude = results.groups.ln / 1000;
                    var route = parts.slice(1).filter(function (part) { return !/^\d(.+)$/.test(part); });
                    route = route.map(function (hop) { return hop || '?'; });
                    decodedString += "<div>Coordinates: " + latitude + " " + results.groups.lac + ", " + longitude + " " + results.groups.lnc + "</div>";
                    decodedString += "<div>Route: " + route.join(' > ') + "</div>";
                }
            }
            if (message.text.includes('#M1BPRG')) {
                console.log('DECODER: #M1BPRG detected');
                var parts = message.text.split('/');
                for (var _b = 0, parts_1 = parts; _b < parts_1.length; _b++) { // eslint-disable-line no-restricted-syntax
                    var part = parts_1[_b];
                    if (part.includes('#M')) {
                        var regex = /#M(?<fms>\w+)PRG/;
                    }
                    if (part.includes('DT')) {
                        var regex = /DT(?<dest>\w+),(?<rway>.+),(?<fuel>.+),(?<eta>.+),(?<rem>.+)/;
                        var result = message.text.match(regex);
                        // console.log('DT result');
                        // console.log(result);
                    }
                    if (part.includes('FN')) {
                        var regex = /FN(?<flight>\w+)/;
                    }
                }
            }
        }
        if (message.label === 'SA') {
            // Media Report
            // Example: 0EV021358VSH/
            // 0      = Version Number
            // E      = Establishment/Loss flag (1)
            // V      = Media Identification (2)
            // 021358 = UTC Timestamp
            // V      = Current Media Available
            // S      = Current Media Available
            // H      = Current Media Available
            // /      = Delimiter (May contain free text after the delimiter)
            //
            // (1) Flags:
            // E = Media Established
            // L = Media Lost
            //
            // (2) Media Types:
            // V = VHF-ACARS
            // S = Default Satcom
            // H = HF
            // G = Global Star Satcom
            // C = ICO Satcom
            // 2 = VDL Mod 2
            // X = Inmarsat Aero H/H+/I/L
            // I = Iridium Satcom
            var parts = message.text.split('/');
            var version = parts[0].text[0];
            var linkState = parts[0].text[1];
            var mediaId = parts[0].text[2];
            var timestamp = parts[0].text.substr(3, 8);
            var availableMedia = parts[0].text.substr(8).split('');
            var freeText = parts[1];
            decodedString += '<div>Media Report</div>';
            decodedString += "<div>Version: " + version + "</div>";
            decodedString += "<div>Link State: " + linkState + "</div>";
            decodedString += "<div>Media Identification: " + mediaId + "</div>";
            decodedString += "<div>Timestamp: " + timestamp.substr(0, 2) + ":" + timestamp.substr(2, 4) + ":" + timestamp.substr(4, 6) + " UTC</div>";
            decodedString += "<div>Available Media: " + availableMedia.join(', ') + "</div>";
            if (freeText) {
                decodedString += "<div>Free Text: " + freeText + "</div>";
            }
        }
        if (message.label === 'SQ') {
            var preamble = message.text.substring(0, 4);
            var version = message.text[1];
            var network = 'Unknown';
            // if (message.text && message.text !== '') {
            //   network = this.store.state.acarsData.labels.SQ.decoderHints.brands[message.text[3]];
            // }
            var airport = void 0;
            var iataCode = void 0;
            var icaoCode = void 0;
            var latitude = void 0;
            var longitude = void 0;
            var stationNumber = void 0;
            var vdlFrequency = void 0;
            if (!network) {
                network = 'Unknown';
            }
            if (version === '2') {
                var regex = /0(\d)X(?<org>\w)(?<iata>\w\w\w)(?<icao>\w\w\w\w)(?<station>\d)(?<lat>\d+)(?<latd>[NS])(?<lng>\d+)(?<lngd>[EW])V(?<vfreq>\d+)\/.*/;
                var result = message.text.match(regex);
                if (result.length >= 8) {
                    iataCode = result.groups.iata;
                    icaoCode = result.groups.icao;
                    stationNumber = result.groups.station;
                    airport = this.lookupAirportByIata(iataCode);
                    latitude = Number(result.groups.lat) / 100 + " " + result.groups.latd;
                    longitude = Number(result.groups.lng) / 100 + " " + result.groups.lngd;
                    vdlFrequency = result.groups.vfreq;
                }
            }
            var decodedMessage = {
                description: 'Ground Station Squitter',
                preamble: preamble,
                version: version,
                network: network,
                iataCode: iataCode,
                icaoCode: icaoCode,
                stationNumber: stationNumber,
                airport: airport,
                latitude: latitude,
                longitude: longitude,
                vdlFrequency: vdlFrequency,
            };
            console.log(decodedMessage);
            decodedString = "\n        <div>" + decodedMessage.description + "</div>\n        <div>Network: " + decodedMessage.network + "</div>\n      ";
            if (decodedMessage.stationNumber) {
                decodedString += "<div>Ground Station: " + decodedMessage.icaoCode + decodedMessage.stationNumber + "</div>";
            }
            if (iataCode) {
                decodedString += "<div>IATA: " + iataCode + "</div>";
            }
            if (icaoCode) {
                decodedString += "<div>ICAO: " + icaoCode + "</div>";
            }
            if (decodedMessage.airport) {
                decodedString += "<div>Airport: " + decodedMessage.airport.name + " (" + decodedMessage.airport.icao + ") in " + decodedMessage.airport.location + "</div>";
            }
            if (decodedMessage.latitude) {
                decodedString += "<div>Coordinates: " + decodedMessage.latitude + ", " + decodedMessage.longitude;
            }
        }
        return decodedString;
    };
    MessageDecoder.prototype.lookupAirportByIata = function (iata) {
        var airportsArray = []; // = this.store.state.acarsData.airports;
        // console.log(airportsArray);
        var airport = airportsArray.filter(function (e) { return e.iata === iata; });
        return airport;
    };
    return MessageDecoder;
}());
exports.MessageDecoder = MessageDecoder;
exports.default = {};
