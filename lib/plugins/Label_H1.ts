import { DecoderPlugin } from '../DecoderPlugin';

export class Label_H1 extends DecoderPlugin {
  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['H1'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;

    if (message.text.includes('#M1BPOS')) {
      console.log('DECODER: #M1BPOS detected');
      const parts = message.text.replace('#M1BPOS', '').split('/')[0].split(',');
      // console.log(parts);

      const coordsRegex = /(?<lac>[NS])(?<la>\d+)(?<lnc>[EW])(?<ln>\d+)/;
      const results = parts[0].match(coordsRegex);
      // console.log(results);

      if (results && results.length >= 4) {
        decodeResult.raw.latitude = results.groups.la / 1000;
        decodeResult.raw.longitude = results.groups.ln / 1000;

        let route = parts.slice(1).filter((part: any) => !/^\d(.+)$/.test(part));
        route = route.map((hop: any) => hop || '?');

        decodeResult.formatted.coordinates = {
          label: 'Coordinates',
          value: `${decodeResult.raw.latitude} ${results.groups.lac}, ${decodeResult.raw.longitude} ${results.groups.lnc}`,
        }
        decodeResult.formatted.route = {
          label: 'Route',
          value: `${route.join(' > ')}`,
        }
      }
      decodeResult.formatted.description = 'Position Report';
    }

    if (message.text.includes('#M1BPRG')) {
      console.log('DECODER: #M1BPRG detected');
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
    }

    return decodeResult;
  }
}

export default {};
