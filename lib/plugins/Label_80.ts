import { DecoderPlugin } from '../DecoderPlugin';

// Airline Defined
// 3N01 POSRPT
export class Label80 extends DecoderPlugin {
  name = 'label-80';

  descriptions: any = {
    ALT: 'Altitude',
    DWND: 'Unknown',
    ETA: 'Estimated Time of Arrival',
    FOB: 'Fuel on Board',
    FL: 'Flight Level',
    HDG: 'Heading',
    MCH: 'Aircraft Speed',
    NWYP: 'Next Waypoint',
    POS: 'Aircraft Position',
    SAT: 'Static Air Temperature',
    SWND: 'Unknown',
    TAS: 'True Airspeed',
    WYP: 'Waypoint',
  }

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['80'],
      preambles: ['3N01 POSRPT'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;

    decodeResult.formatted.description = 'Airline Defined Position Report';

    const parts = message.text.split('\n');

    let posRptRegex = /^3N01 POSRPT \d\d\d\d\/\d\d (?<orig>\w+)\/(?<dest>\w+) \.(?<tail>[\w-]+)(\/(?<agate>.+) (?<sta>\w+:\w+))*/; // eslint-disable-line max-len
    let results = parts[0].match(posRptRegex);
    if (results && results.length > 0) {
      decodeResult.formatted.items.origin = {
        label: 'Origin',
        value: `${results.groups.orig}`,
      };
      decodeResult.formatted.items.destination = {
        label: 'Destination',
        value: `${results.groups.dest}`,
      };
      decodeResult.formatted.items.tail = {
        label: 'Tail',
        value: `${results.groups.tail}`,
      };
      if (results.groups.agate) {
        decodeResult.formatted.items.arrival_gate = {
          label: 'Arrival Gate',
          value: `${results.groups.agate}`,
        };
        decodeResult.formatted.items.sta = {
          label: 'Scheduled Time of Arrival',
          value: `${results.groups.sta}`,
        };
      }

      posRptRegex = /\/(?<field>\w+)\s(?<value>[\w\+\-:\.^\s]+)/g; // eslint-disable-line no-useless-escape
      const remainingParts = parts.slice(1);
      for (const part of remainingParts) { // eslint-disable-line no-restricted-syntax
        results = part.matchAll(posRptRegex);
        console.log(results);
        if (results) {
          for (const result of results) { // eslint-disable-line no-restricted-syntax
            switch (result.groups.field) {
              case 'ALT': {
                decodeResult.formatted.items.altitude = {
                  label: this.descriptions[result.groups.field],
                  value: `${result.groups.value} feet`,
                };
                break;
              }
              case 'MCH': {
                decodeResult.formatted.items.mach = {
                  label: this.descriptions[result.groups.field],
                  value: `${result.groups.value / 1000} Mach`,
                };
                break;
              }
              case 'POS': {
                const posRegex = /^(?<latd>[NS])(?<lat>.+)(?<lngd>[EW])(?<lng>.+)/;
                const posResult = result.groups.value.match(posRegex);
                const latitude = (Number(posResult.groups.lat) / 1000) * (posResult.groups.lngd === 'S' ? -1 : 1);
                const longitude = (Number(posResult.groups.lng) / 1000) * (posResult.groups.lngd === 'W' ? -1 : 1);
                decodeResult.raw.aircraft_position = {
                  latitude,
                  longitude,
                };
                decodeResult.formatted.items.position = {
                  label: this.descriptions[result.groups.field],
                  value: `${(Number(posResult.groups.lat) / 1000).toPrecision(5)} ${posResult.groups.latd}, ${(Number(posResult.groups.lng) / 1000).toPrecision(5)} ${posResult.groups.lngd}`,
                };
                break;
              }
              default: {
                const description = this.descriptions[result.groups.field] ? this.descriptions[result.groups.field] : 'Unknown';
                decodeResult.formatted.items[result.groups.field] = {
                  code: result.groups.field,
                  label: description || `Unknown (${result.groups.field})`,
                  value: `${result.groups.value}`,
                };
              }
            }
          }
        }
      }

      decodeResult.decoded = true;
      decodeResult.decodeLevel = 'partial';
    }

    return decodeResult;
  }
}

export default {};
