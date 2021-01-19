import { DecoderPluginInterface } from './DecoderPluginInterface'; // eslint-disable-line import/no-cycle

import * as Plugins from './plugins/official';

export class MessageDecoder {
  name : string;
  plugins : Array<DecoderPluginInterface>;
  debug : boolean;

  constructor() {
    this.name = 'acars-decoder-typescript';
    this.plugins = [];
    this.debug = false;

    this.registerPlugin(new Plugins.Label_ColonComma(this));
    this.registerPlugin(new Plugins.Label_5Z(this));
    this.registerPlugin(new Plugins.Label_15(this));
    this.registerPlugin(new Plugins.Label_44_ETA(this));
    this.registerPlugin(new Plugins.Label_44_IN(this));
    this.registerPlugin(new Plugins.Label_44_OFF(this));
    this.registerPlugin(new Plugins.Label_44_ON(this));
    this.registerPlugin(new Plugins.Label_44_POS(this));
    this.registerPlugin(new Plugins.Label_H1_M1BPOS(this));
    this.registerPlugin(new Plugins.Label_80(this));
    this.registerPlugin(new Plugins.Label_SQ(this));
  }

  registerPlugin(plugin: DecoderPluginInterface) : boolean {
    const pluginInstance = plugin;
    // plugin.onRegister(this.store);
    this.plugins.push(plugin);
    return true;
  }

  decode(message: any, options: any = {}) {
    // console.log('All plugins');
    // console.log(this.plugins);
    const usablePlugins = this.plugins.filter((plugin) => {
      const qualifiers : any = plugin.qualifiers();

      if (qualifiers.labels.includes(message.label)) {
        if (qualifiers.preambles && qualifiers.preambles.length > 0) {
          const matching = qualifiers.preambles.filter((preamble: string) => { // eslint-disable-line arrow-body-style,max-len
            // console.log(message.text.substring(0, preamble.length));
            // console.log(preamble);
            return message.text.substring(0, preamble.length) === preamble;
          });
          // console.log(matching);
          return matching.length >= 1;
        } else { // eslint-disable-line no-else-return
          return true;
        }
      }

      return false;
    });

    if (options.debug) {
      console.log('Usable plugins');
      console.log(usablePlugins);
    }

    let result;
    if (usablePlugins.length > 0) {
      const plugin: DecoderPluginInterface = usablePlugins[0];
      result = plugin.decode(message);
    } else {
      result = {
        decoded: false,
        decodeLevel: 'none',
        error: 'No known decoder plugin for this message',
        message: message,
        remaining: {
          text: message.text,
        },
        raw: {},
        formatted: {},
      };
    }

    if (options.debug) {
      let performDebug = true;
      if (options.debug.only_decoded) {
        performDebug = result.decoded;
      }

      if (performDebug) {
        console.log('Result');
        console.log(result);
      }
    }

    return result;
  }

  lookupAirportByIata(iata: string) : any {
    const airportsArray : Array<any> = []; // = this.store.state.acarsData.airports;
    // console.log(airportsArray);
    const airport = airportsArray.filter((e: any) => e.iata === iata);

    return airport;
  }
}

export default {
};
