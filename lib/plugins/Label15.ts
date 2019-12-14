import { DecoderPlugin } from '../DecoderPlugin';

// General Aviation Position Report
export class Label15 extends DecoderPlugin {
  name = 'label-5z';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['15'],
      preambles: ['(2'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;
    decodeResult.formatted.description = 'Position Report';

    const twoZeeRegex = /^\(2(?<between>.+)\(Z$/;
    const results = message.text.match(twoZeeRegex);
    if (results) {
      // Style: (2N38111W 82211266 76400-64(Z
      console.log(`Label 15 Position Report: between = ${results.groups.between}`);

      decodeResult.raw.latitude_direction = results.groups.between.substr(0, 1);
      decodeResult.raw.latitude = Number(results.groups.between.substr(1, 5)) / 1000;
      decodeResult.raw.longitude_direction = results.groups.between.substr(6, 1);
      decodeResult.raw.longitude = Number(results.groups.between.substr(7, 6)) / 1000;
      decodeResult.remaining.text = results.groups.between.substr(13);

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
