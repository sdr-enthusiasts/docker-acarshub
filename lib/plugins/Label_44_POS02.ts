import { DecoderPlugin } from '../DecoderPlugin';

// General Aviation Position Report
export class Label_44_POS02 extends DecoderPlugin {
  name = 'label-44-pos02';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['44'],
      preambles: ['POS02'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;
    decodeResult.formatted.description = 'Position Report';

    // Style: POS02,N38338W121179,GRD,KMHR,KPDX,0807,0003,0112,005.1
    // Match: POS02,coords,flight_level_or_ground,departure_icao,arrival_icao,current_date,current_time,eta_time,unknown
    const regex = /^POS02,(?<unsplit_coords>),(?<flight_level_or_ground>),(?<departure_icao>),(?<arrival_icao>),(?<current_date>),(?<current_time>),(?<eta_time),(?<unknown>)$/;
    const results = message.text.match(regex);
    if (results) {
      console.log(`Label 44 Position Report: groups = ${results.groups}`);

      decodeResult.raw.latitude_direction = results.groups.unsplit_coords.substr(0, 1);
      decodeResult.raw.latitude = Number(results.groups.unsplit_coords.substr(1, 5)) / 1000;
      decodeResult.raw.longitude_direction = results.groups.unsplit_coords.substr(6, 1);
      decodeResult.raw.longitude = Number(results.groups.unsplit_coords.substr(7, 6)) / 1000;

      decodeResult.formatted.items.coordinates = {
        label: 'Coordinates',
        value: `${decodeResult.raw.latitude} ${decodeResult.raw.latitude_direction}, ${decodeResult.raw.longitude} ${decodeResult.raw.longitude_direction}`,
      };
    }

    decodeResult.decoded = true;
    decodeResult.decoder.decodeLevel = 'partial';

    return decodeResult;
  }
}

export default {};
