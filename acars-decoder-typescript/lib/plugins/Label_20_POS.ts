import { DecoderPlugin } from '../DecoderPlugin';

// Position Report
export class Label_20_POS extends DecoderPlugin {
  name = 'label-20-pos';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['20'],
      preambles: ['POS'],
    };
  }

  decode(message: any, options: any = {}) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;
    decodeResult.formatted.description = 'Position Report';
    decodeResult.message = message;

    decodeResult.raw.preamble = message.text.substring(0, 3);

    const content = message.text.substring(3);
    console.log('Content: ' + content);

    const fields = content.split(',');
    console.log('Field Count: ' + fields.length);

    if (fields.length == 11) {
      // N38160W077075,,211733,360,OTT,212041,,N42,19689,40,544
      console.log(`DEBUG: ${this.name}: Variation 1 detected`);

      // Field 1: Coordinates
      const rawCoords = fields[0];
      decodeResult.raw.position = this.decodeStringCoordinates(rawCoords);
      decodeResult.formatted.items.push({
        type: 'position',
        label: 'Position',
        value: this.coordinateString(decodeResult.raw.position),
      });

      decodeResult.decoded = true;
      decodeResult.decoder.decodeLevel = 'full';
    } else if (fields.length == 5) {
      // N38160W077075,,211733,360,OTT
      console.log(`DEBUG: ${this.name}: Variation 2 detected`);

      // Field 1: Coordinates
      const rawCoords = fields[0];
      decodeResult.raw.position = this.decodeStringCoordinates(rawCoords);
      decodeResult.formatted.items.push({
        type: 'position',
        label: 'Position',
        value: this.coordinateString(decodeResult.raw.position),
      });

      decodeResult.decoded = true;
      decodeResult.decoder.decodeLevel = 'full';
    } else {
      // Unknown!
      console.log(`DEBUG: ${this.name}: Unknown variation. Field count: ${fields.length}, content: ${content}`);
      decodeResult.decoded = false;
      decodeResult.decoder.decodeLevel = 'none';
    }
    return decodeResult;
  }
}

export default {};
