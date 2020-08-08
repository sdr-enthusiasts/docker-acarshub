import { DecoderPluginInterface } from './DecoderPluginInterface'; // eslint-disable-line import/no-cycle

import * as Plugins from './plugins/official';

export class MessageDecoder {
  name : string;
  plugins : Array<DecoderPluginInterface>;

  constructor() {
    this.name = 'acars-decoder-typescript';
    this.plugins = [];

    this.registerPlugin(new Plugins.Label_ColonComma(this));
    this.registerPlugin(new Plugins.Label_5Z(this));
    this.registerPlugin(new Plugins.Label_15(this));
    this.registerPlugin(new Plugins.Label_44_ETA(this));
    this.registerPlugin(new Plugins.Label_44_IN(this));
    this.registerPlugin(new Plugins.Label_44_OFF(this));
    this.registerPlugin(new Plugins.Label_44_ON(this));
    this.registerPlugin(new Plugins.Label_44_POS(this));
    this.registerPlugin(new Plugins.Label_H1_M1BPOS(this));
    this.registerPlugin(new Plugins.Label_80(this));
    this.registerPlugin(new Plugins.Label_SQ(this));
  }

  registerPlugin(plugin: DecoderPluginInterface) : boolean {
    const pluginInstance = plugin;
    // plugin.onRegister(this.store);
    this.plugins.push(plugin);
    return true;
  }

  decode(message: any, options: any = {}) {
    // console.log('All plugins');
    // console.log(this.plugins);
    const usablePlugins = this.plugins.filter((plugin) => {
      const qualifiers : any = plugin.qualifiers();

      if (qualifiers.labels.includes(message.label)) {
        if (qualifiers.preambles && qualifiers.preambles.length > 0) {
          const matching = qualifiers.preambles.filter((preamble: string) => { // eslint-disable-line arrow-body-style,max-len
            // console.log(message.text.substring(0, preamble.length));
            // console.log(preamble);
            return message.text.substring(0, preamble.length) === preamble;
          });
          // console.log(matching);
          return matching.length >= 1;
        } else { // eslint-disable-line no-else-return
          return true;
        }
      }

      return false;
    });
    console.log('Usable plugins');
    console.log(usablePlugins);

    let result;
    if (usablePlugins.length > 0) {
      const plugin: DecoderPluginInterface = usablePlugins[0];
      result = plugin.decode(message);
    } else {
      result = {
        decoded: false,
        decodeLevel: 'none',
        error: 'No known decoder plugin for this message',
        message: message,
        remaining: {
          text: message.text,
        },
        raw: {},
        formatted: {},
      };
    }

    if (options.debug) {
      let performDebug = true;
      if (options.debug.only_decoded) {
        performDebug = result.decoded;
      }

      if (performDebug) {
        console.log('Result');
        console.log(result);
      }
    }

    return result;
  }

  decodeMessage(message: any) : string {
    let decodedString = '';

    if (message.label === ':;') {
      decodedString += '<div>Aircraft Transceiver Frequency Change</div>';
      const frequency = Number(message.text) / 1000;
      decodedString += `${frequency} MHz`;
    }

    if (message.label === '15') {
      // General Aviation Position Report
      decodedString += '<div>Position Report</div>';

      const twoZeeRegex = /^\(2(?<between>.+)\(Z$/;
      const results = message.text.match(twoZeeRegex);
      if (results) {
        // Style: (2N38111W 82211266 76400-64(Z
        // console.log(`Label 15 Position Report: between = ${results.groups.between}`);
      }
    }

    if (message.label === '5Z') {
      decodedString += '<div>Airline Designated Downlink</div>';

      const uaRegex = /^\/(?<type>\w+) (?<remainder>.+)/;
      let results = message.text.match(uaRegex);

      if (results && results.length >= 2) {
        // Successful match: United Airlines 5Z message
        const type = results.groups.type.split('/')[0];
        const { remainder } = results.groups;
        // console.log(results);
        // console.log(`DECODER: Matched 'United Airlines 5Z': type = ${type}, remainder = ${remainder}`);

        let typeDescription;
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
        decodedString += `<div>Message Type: ${typeDescription} (${type})</div>`;

        if (type === 'B3') {
          const rdcRegex = /^(?<from>\w\w\w)(?<to>\w\w\w) (?<unknown1>\d\d) R(?<runway>.+) G(?<unknown2>.+)$/; // eslint-disable-line max-len
          results = remainder.match(rdcRegex);

          if (results) {
            decodedString += `<div>Origin: ${results.groups.from}</div>`;
            decodedString += `<div>Destination: ${results.groups.to}</div>`;
            decodedString += `<div>Unknown Field 1: ${results.groups.unknown1}</div>`;
            decodedString += `<div>Runway: ${results.groups.runway}</div>`;
            decodedString += `<div>Unknown FIeld 2: ${results.groups.unknown2}</div>`;
          } else {
            console.log(`Decoder: Unkown 5Z RDC format: ${remainder}`);
          }
        } else {
          decodedString += `<div>Remainder: ${remainder} (Will analyze and decode in the future)</div>`;
        }
      } else {
        // Unknown
        console.log(`Decoder: Unknown 5Z message: ${message.text}`);
      }
    }

    if (message.label === '80') {
      // Airline Defined
      decodedString += '<div>Airline Defined</div>';

      const parts = message.text.split('\n');
      // console.log(parts);

      if (parts[0].substr(0, 11) === '3N01 POSRPT') {
        // 3N01 POSRPT
        let posRptRegex = /^3N01 POSRPT \d\d\d\d\/\d\d (?<orig>\w+)\/(?<dest>\w+) \.(?<tail>[\w-]+)(\/(?<agate>.+) (?<sta>\w+:\w+))*/; // eslint-disable-line max-len
        let results = parts[0].match(posRptRegex);
        if (results && results.length > 0) {
          // This implementation with embedded HTML is temporary
          // console.log('DECODER: 3N01 POSRPT match');
          decodedString += '<div class="mb-2">Position Report</div>';
          decodedString += '<table class="table table-sm table-bordered">';
          decodedString += `<tr><td>Origin</td><td>${results.groups.orig}</td></tr>`;
          decodedString += `<tr><td>Destination</td><td>${results.groups.dest}</td></tr>`;
          decodedString += `<tr><td>Tail</td><td>${results.groups.tail}</td></tr>`;
          if (results.groups.agate) {
            decodedString += `<tr><td>Arrival Gate</td><td>${results.groups.agate}</td></tr>`;
            decodedString += `<tr><td>Scheduled Time of Arrival (STA)</td><td>${results.groups.sta}</td></tr>`;
          }

          posRptRegex = /\/(?<field>\w+)\s(?<value>[\w\+\-:\.^\s]+)/g; // eslint-disable-line no-useless-escape
          const remainingParts = parts.slice(1);
          for (const part of remainingParts) { // eslint-disable-line no-restricted-syntax
            results = part.matchAll(posRptRegex);
            // console.log(results);
            if (results) {
              for (const result of results) { // eslint-disable-line no-restricted-syntax
                switch (result.groups.field) {
                  case 'ALT': {
                    decodedString += `<tr><td>Altitude (${result.groups.field})</td><td>${result.groups.value} feet</td></tr>`;
                    break;
                  }
                  case 'DWND': {
                    decodedString += `<tr><td>Unknown (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  }
                  case 'ETA':
                    decodedString += `<tr><td>Estimated Time of Arrival (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  case 'FOB':
                    decodedString += `<tr><td>Fuel on Board (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  case 'FL':
                    decodedString += `<tr><td>Flight Level (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  case 'HDG':
                    decodedString += `<tr><td>Heading (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  case 'MCH':
                    decodedString += `<tr><td>Aircraft Speed (${result.groups.field})</td><td>${result.groups.value} mach</td></tr>`;
                    break;
                  case 'NWYP':
                    decodedString += `<tr><td>Unknown (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  case 'POS': {
                    const posRegex = /^(?<latd>[NS])(?<lat>.+)(?<lngd>[EW])(?<lng>.+)/;
                    const posResult = result.groups.value.match(posRegex);
                    decodedString += `<tr><td>Position (${result.groups.field})</td><td>${(Number(posResult.groups.lat) / 100).toPrecision(5)} ${posResult.groups.latd}, ${(Number(posResult.groups.lng) / 100).toPrecision(5)} ${posResult.groups.lngd}</td></tr>`;
                    break;
                  }
                  case 'SAT':
                    decodedString += `<tr><td>Static Air Temperature (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  case 'SWND':
                    decodedString += `<tr><td>Unknown (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  case 'TAS':
                    decodedString += `<tr><td>True Airspeed (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
                    break;
                  default:
                    decodedString += `<tr><td>Unknown (${result.groups.field})</td><td>${result.groups.value}</td></tr>`;
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
        // console.log('DECODER: #M1BPOS detected');
        const parts = message.text.replace('#M1BPOS', '').split('/')[0].split(',');
        // console.log(parts);

        decodedString += '<div>Position Report</div>';

        const coordsRegex = /(?<lac>[NS])(?<la>\d+)(?<lnc>[EW])(?<ln>\d+)/;
        const results = parts[0].match(coordsRegex);
        // console.log(results);

        if (results && results.length >= 4) {
          const latitude = results.groups.la / 1000;
          const longitude = results.groups.ln / 1000;
          let route = parts.slice(1).filter((part: any) => !/^\d(.+)$/.test(part));
          route = route.map((hop: any) => hop || '?');

          decodedString += `<div>Coordinates: ${latitude} ${results.groups.lac}, ${longitude} ${results.groups.lnc}</div>`;
          decodedString += `<div>Route: ${route.join(' > ')}</div>`;
        }
      }

      if (message.text.includes('#M1BPRG')) {
        // console.log('DECODER: #M1BPRG detected');
        const parts = message.text.split('/');
        for (const part of parts) { // eslint-disable-line no-restricted-syntax
          if (part.includes('#M')) {
            const regex = /#M(?<fms>\w+)PRG/;
          }

          if (part.includes('DT')) {
            const regex = /DT(?<dest>\w+),(?<rway>.+),(?<fuel>.+),(?<eta>.+),(?<rem>.+)/;
            const result = message.text.match(regex);
            // console.log('DT result');
            // console.log(result);
          }

          if (part.includes('FN')) {
            const regex = /FN(?<flight>\w+)/;
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
      let parts;
      if (message.text.includes('/')) {
        parts = message.text.split('/');
      } else {
        parts = [message.text]
      }
      const version = parts[0].substring(0, 1);
      const linkState = parts[0].substring(1, 2);
      const mediaId = parts[0].substring(2, 3);
      const timestamp = parts[0].substring(3, 9);
      const availableMedia = parts[0].substring(9).split('');

      let freeText = '';
      if (parts.length > 1) {
        freeText = parts[1];
      }

      decodedString += '<div>Media Report</div>';
      decodedString += `<div>Version: ${version}</div>`;
      decodedString += `<div>Link State: ${linkState}</div>`;
      decodedString += `<div>Media Identification: ${mediaId}</div>`;
      decodedString += `<div>Timestamp: ${timestamp.substr(0, 2)}:${timestamp.substr(2, 4)}:${timestamp.substr(4, 6)} UTC</div>`;
      decodedString += `<div>Available Media: ${availableMedia.join(', ')}</div>`;
      if (freeText) {
        decodedString += `<div>Free Text: ${freeText}</div>`;
      }
    }

    if (message.label === 'SQ') {
      const preamble = message.text.substring(0, 4);
      const version = message.text[1];
      let network = 'Unknown';
      // if (message.text && message.text !== '') {
      //   network = this.store.state.acarsData.labels.SQ.decoderHints.brands[message.text[3]];
      // }
      let airport;
      let iataCode;
      let icaoCode;
      let latitude;
      let longitude;
      let stationNumber;
      let vdlFrequency;

      if (!network) {
        network = 'Unknown';
      }

      if (version === '2') {
        const regex = /0(\d)X(?<org>\w)(?<iata>\w\w\w)(?<icao>\w\w\w\w)(?<station>\d)(?<lat>\d+)(?<latd>[NS])(?<lng>\d+)(?<lngd>[EW])V(?<vfreq>\d+)\/.*/;
        const result = message.text.match(regex);

        if (result.length >= 8) {
          iataCode = result.groups.iata;
          icaoCode = result.groups.icao;
          stationNumber = result.groups.station;
          airport = this.lookupAirportByIata(iataCode);
          latitude = `${Number(result.groups.lat) / 100} ${result.groups.latd}`;
          longitude = `${Number(result.groups.lng) / 100} ${result.groups.lngd}`;
          vdlFrequency = result.groups.vfreq;
        }
      }

      const decodedMessage = {
        description: 'Ground Station Squitter',
        preamble,
        version,
        network,
        iataCode,
        icaoCode,
        stationNumber,
        airport,
        latitude,
        longitude,
        vdlFrequency,
      };
      // console.log(decodedMessage);

      decodedString = `
        <div>${decodedMessage.description}</div>
        <div>Network: ${decodedMessage.network}</div>
      `;

      if (decodedMessage.stationNumber) {
        decodedString += `<div>Ground Station: ${decodedMessage.icaoCode}${decodedMessage.stationNumber}</div>`;
      }

      if (iataCode) {
        decodedString += `<div>IATA: ${iataCode}</div>`;
      }

      if (icaoCode) {
        decodedString += `<div>ICAO: ${icaoCode}</div>`;
      }

      if (decodedMessage.airport) {
        decodedString += `<div>Airport: ${decodedMessage.airport.name} (${decodedMessage.airport.icao}) in ${decodedMessage.airport.location}</div>`;
      }

      if (decodedMessage.latitude) {
        decodedString += `<div>Coordinates: ${decodedMessage.latitude}, ${decodedMessage.longitude}`;
      }
    }

    return decodedString;
  }

  lookupAirportByIata(iata: string) : any {
    const airportsArray : Array<any> = []; // = this.store.state.acarsData.airports;
    // console.log(airportsArray);
    const airport = airportsArray.filter((e: any) => e.iata === iata);

    return airport;
  }
}

export default {
};
