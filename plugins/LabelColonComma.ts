import { DecoderPlugin } from '../DecoderPlugin';

export class LabelColonComma extends DecoderPlugin {
  name = 'label-colon-comma';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: [':;'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;

    decodeResult.raw.frequency = Number(message.text) / 1000;

    decodeResult.formatted.description = 'Aircraft Transceiver Frequency Change';
    decodeResult.formatted.items.frequency = {
      label: 'Frequency',
      value: `${decodeResult.raw.frequency} MHz`,
    };

    decodeResult.decoded = true;
    decodeResult.decoder.decodeLevel = 'full';

    return decodeResult;
  }
}

export default {};
