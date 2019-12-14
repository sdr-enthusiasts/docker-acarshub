import { DecoderPlugin } from '../DecoderPlugin';

export class Label_H1_M1BPOS extends DecoderPlugin { // eslint-disable-line camelcase
  name = 'label-h1-m1bpos';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['H1'],
      preambles: ['#M1BPOS'],
    };
  }

  decode(message: any) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;

    console.log('DECODER: #M1BPOS detected');
    const parts = message.text.replace('#M1BPOS', '').split('/');
    const firstHalf = parts[0];
    const secondHalf = parts[1];
    const items = firstHalf.split(',');

    const coordsRegex = /(?<lac>[NS])(?<la>\d+)(?<lnc>[EW])(?<ln>\d+)/;
    const results = items[0].match(coordsRegex);

    if (results && results.length >= 4) {
      decodeResult.raw.latitude = results.groups.la / 1000;
      decodeResult.raw.longitude = results.groups.ln / 1000;

      let route = items.slice(1).filter((part: any) => !/^\d(.+)$/.test(part));
      route = route.map((hop: any) => hop || '?');
      decodeResult.raw.route = route;

      decodeResult.formatted.description = 'Position Report';
      decodeResult.formatted.items = {
        coordinates: {
          label: 'Coordinates',
          value: `${decodeResult.raw.latitude} ${results.groups.lac}, ${decodeResult.raw.longitude} ${results.groups.lnc}`,
        },
        route: {
          label: 'Route',
          value: `${route.join(' > ')}`,
        },
      };
      decodeResult.decoded = true;
      decodeResult.decoder.decodeLevel = 'partial';
    }
    decodeResult.remaining.text = secondHalf;

    return decodeResult;
  }
}

export default {};
