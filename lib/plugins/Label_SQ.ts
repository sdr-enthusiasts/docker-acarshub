import { DecoderPlugin } from '../DecoderPlugin';

export class Label_SQ extends DecoderPlugin {
  name = 'label-sq';

  qualifiers() { // eslint-disable-line class-methods-use-this
    return {
      labels: ['SQ'],
    };
  }

  decode(message: any, options: any = {}) : any {
    const decodeResult: any = this.defaultResult;
    decodeResult.decoder.name = this.name;

    decodeResult.raw.preamble = message.text.substring(0, 4);
    decodeResult.raw.version = message.text.substring(1, 2);

    decodeResult.raw.network = 'Unknown';
    // if (message.text && message.text !== '') {
    //   decodeResult.raw.network = this.store.state.acarsData.labels.SQ.decoderHints.brands[message.text[3]]; // eslint-disable-line max-len
    // }

    if (decodeResult.raw.version === '2') {
      const regex = /0(\d)X(?<org>\w)(?<iata>\w\w\w)(?<icao>\w\w\w\w)(?<station>\d)(?<lat>\d+)(?<latd>[NS])(?<lng>\d+)(?<lngd>[EW])V(?<vfreq>\d+)\/.*/;
      const result = message.text.match(regex);

      if (result.length >= 8) {
        decodeResult.raw.iataCode = result.groups.iata;
        decodeResult.raw.icaoCode = result.groups.icao;
        decodeResult.raw.stationNumber = result.groups.station;
        decodeResult.raw.airport = this.decoder.lookupAirportByIata(decodeResult.raw.iataCode);
        decodeResult.raw.ground_station_position = {
          latitude: (Number(result.groups.lat) / 100) * (result.groups.latd === 'S' ? -1 : 1),
          longitude: (Number(result.groups.lng) / 100) * (result.groups.lngd === 'W' ? -1 : 1)
        }
        decodeResult.raw.vdlFrequency = result.groups.vfreq;
      }
    }

    decodeResult.formatted.description = 'Ground Station Squitter';
    decodeResult.formatted.items = {
      network: {
        label: 'Network',
        value: decodeResult.raw.network,
      },
    };
    if (decodeResult.raw.icaoCode && decodeResult.raw.stationNumber) {
      decodeResult.formatted.items.groundStation = {
        label: 'Ground Station',
        value: `${decodeResult.raw.icaoCode}${decodeResult.raw.stationNumber}`,
      };
    }
    if (decodeResult.raw.iataCode) {
      decodeResult.formatted.items.iata = {
        label: 'IATA',
        value: decodeResult.raw.iataCode,
      };
    }
    if (decodeResult.raw.icaoCode) {
      decodeResult.formatted.items.icao = {
        label: 'ICAO',
        value: decodeResult.raw.icaoCode,
      };
    }
    if (decodeResult.raw.latitude) {
      decodeResult.formatted.items.coordinates = {
        label: 'Ground Station Position',
        value: `${decodeResult.raw.latitude}, ${decodeResult.raw.longitude}`,
      };
    }
    if (decodeResult.raw.airport) {
      decodeResult.formatted.items.airport = {
        label: 'Airport',
        value: `${decodeResult.raw.airport.name} (${decodeResult.raw.airport.icao}) in ${decodeResult.raw.airport.location}`,
      };
    }
    decodeResult.decoded = true;
    decodeResult.decoder.decodeLevel = 'full';

    return decodeResult;
  }
}

export default {};
