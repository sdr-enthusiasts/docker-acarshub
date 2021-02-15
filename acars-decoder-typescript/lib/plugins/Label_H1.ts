import { DecoderPlugin } from '../DecoderPlugin';

export class Label_H1 extends DecoderPlugin {
  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['H1'],
    };
  }

  decode(message: any, options: any = {}) : any {
    const decodeResult: any = this.defaultResult;
    // console.log('DECODER: H1 detected');

    return decodeResult;
  }
}

export default {};
