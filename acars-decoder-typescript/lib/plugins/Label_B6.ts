import { DecoderPlugin } from '../DecoderPlugin';

// CPDLC
export class Label_B6_Forwardslash extends DecoderPlugin {
  name = 'label-b6-forwardslash';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['B6'],
      preambles: ['/'],
    };
  }

  decode(message: any, options: any = {}) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;
    decodeResult.formatted.description = 'CPDLC Message';
    decodeResult.message = message;

    if (options.debug) {
      console.log("CPDLC: " + message);
    }

    return decodeResult;
  }
}

export default {};
