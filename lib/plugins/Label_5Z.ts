import { DecoderPlugin } from '../DecoderPlugin';

export class Label5Z extends DecoderPlugin {
  name = 'label-5z';

  descriptions: any = {
    B1: 'Request Weight and Balance',
    B3: 'Request Departure Clearance',
    CD: 'Weight and Balance',
    CG: 'Request Pre-departure clearance, PDC',
    CM: 'Crew Scheduling',
    C3: 'Off Message',
    C4: 'Flight Dispatch',
    C5: 'Maintenance Message',
    C6: 'Customer Service',
    10: 'PIREP',
    C11: 'International PIREP',
    DS: 'Late Message',
    D3: 'Holding Pattern Message',
    D6: 'From-To + Date',
    D7: 'From-To + Alternate + Time',
    EO: 'In Range',
    PW: 'Position Weather',
    RL: 'Request Release',
    R3: 'Request HOWGOZIT Message',
    R4: 'Request the Latest POSBD',
    TC: 'From-To Fuel',
    WB: 'From-To',
    W1: 'Request Weather for City',
  };

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['5Z'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;

    decodeResult.formatted.description = 'Airline Designated Downlink';

    const uaRegex = /^\/(?<type>\w+) (?<remainder>.+)/;
    let results = message.text.match(uaRegex);

    if (results && results.length >= 2) {
      // Successful match: United Airlines 5Z message
      const type : string = results.groups.type.split('/')[0];
      const { remainder } = results.groups;
      console.log(results);
      console.log(`DECODER: Matched 'United Airlines 5Z': type = ${type}, remainder = ${remainder}`);

      const typeDescription: string = this.descriptions[type] ? this.descriptions[type] : 'Unknown';
      decodeResult.formatted.items.airline = {
        label: 'Airline',
        value: 'United Airlines',
      };
      decodeResult.formatted.items.type = {
        label: 'Message Type',
        value: `${typeDescription} (${type})`,
      };

      if (type === 'B3') {
        const rdcRegex = /^(?<from>\w\w\w)(?<to>\w\w\w) (?<unknown1>\d\d) R(?<runway>.+) G(?<unknown2>.+)$/; // eslint-disable-line max-len
        results = remainder.match(rdcRegex);

        if (results) {
          decodeResult.formatted.items.origin = {
            label: 'Origin',
            value: `${results.groups.from}`,
          };
          decodeResult.formatted.items.origin = {
            label: 'Destination',
            value: `${results.groups.to}`,
          };
          decodeResult.formatted.items.origin = {
            label: 'Unknown Field 1',
            value: `${results.groups.unknown1}`,
          };
          decodeResult.formatted.items.origin = {
            label: 'Runway',
            value: `${results.groups.runway}`,
          };
          decodeResult.formatted.items.origin = {
            label: 'Unknown Field 2',
            value: `${results.groups.unknown2}`,
          };
        } else {
          console.log(`Unkown 5Z RDC format: ${remainder}`);
        }
      } else {
        decodeResult.remaining.text = remainder;
      }
      decodeResult.decoded = true;
      decodeResult.decoder.decodeLevel = 'partial';
    } else {
      // Unknown
      console.log(`Unknown 5Z message: ${message.text}`);
      decodeResult.remaining.text = message.text;
      decodeResult.decoded = false;
      decodeResult.decoder.decodeLevel = 'none';
    }

    return decodeResult;
  }
}

export default {};
