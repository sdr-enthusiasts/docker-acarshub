import { DecoderPlugin } from '../DecoderPlugin';

export class Label_H1_M1BPRG extends DecoderPlugin { // eslint-disable-line camelcase
  name = 'label-h1-m1bprg';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['H1'],
      preambles: ['#M1BPRG'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;

    console.log('DECODER: H1 #M1BPRG detected');
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

    return decodeResult;
  }
}

export default {};
