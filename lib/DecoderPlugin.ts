import { DecoderPluginInterface } from './DecoderPluginInterface';

export abstract class DecoderPlugin implements DecoderPluginInterface {
  decoder!: any;

  name: string = 'unknown';

  defaultResult: any = {
    decoded: false,
    decoder: <any>{
      name: 'unknown',
      type: 'pattern-match',
      decodeLevel: 'none',
    },
    formatted: <any>{
      description: 'Unknown',
      items: <any>{},
    },
    raw: <any>{},
    remaining: <any>{},
  };

  options: Object;

  constructor(decoder : any, options : any = {}) {
    this.decoder = decoder;
    this.options = options;
  }

  id() : string { // eslint-disable-line class-methods-use-this
    console.log('DecoderPlugin subclass has not overriden id() to provide a unique ID for this plugin!');
    return 'abstract_decoder_plugin';
  }

  meetsStateRequirements() : boolean { // eslint-disable-line class-methods-use-this
    return true;
  }

  // onRegister(store: Store<any>) {
  //   this.store = store;
  // }

  qualifiers() : any { // eslint-disable-line class-methods-use-this
    const labels : Array<string> = [];

    return {
      labels,
    };
  }

  decode(message: any) : any { // eslint-disable-line class-methods-use-this
    const decodeResult: any = this.defaultResult;
    decodeResult.remaining.text = message.text;
    return decodeResult;
  }
}

export default {};
