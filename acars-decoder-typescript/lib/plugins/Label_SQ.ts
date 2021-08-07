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
    decodeResult.raw.network = message.text.substring(3, 4);

    if (decodeResult.raw.version === '2') {
      const regex = /0(\d)X(?<org>\w)(?<iata>\w\w\w)(?<icao>\w\w\w\w)(?<station>\d)(?<lat>\d+)(?<latd>[NS])(?<lng>\d+)(?<lngd>[EW])V(?<vfreq>\d+)\/.*/;
      const result = message.text.match(regex);

      if (result && result.length >= 8) {
        decodeResult.raw.groundStation = {
          number: result.groups.station,
          iataCode: result.groups.iata,
          icaoCode: result.groups.icao,
          coordinates: {
            latitude: (Number(result.groups.lat) / 100) * (result.groups.latd === 'S' ? -1 : 1),
            longitude: (Number(result.groups.lng) / 100) * (result.groups.lngd === 'W' ? -1 : 1)
          }
        }
        decodeResult.raw.vdlFrequency = result.groups.vfreq / 1000.0;
      }
    }

    decodeResult.formatted.description = 'Ground Station Squitter';

    var formattedNetwork = 'Unknown';
    if (decodeResult.raw.network == 'A') {
      formattedNetwork = 'ARINC';
    } else if (decodeResult.raw.network == 'S') {
      formattedNetwork = 'SITA';
    }
    decodeResult.formatted.items = [
      {
        type: 'network',
        label: 'Network',
        value: formattedNetwork,
      },
      {
        type: 'version',
        label: 'Version',
        value: decodeResult.raw.version,
      }
    ];

    if (decodeResult.raw.groundStation) {
      if (decodeResult.raw.groundStation.icaoCode && decodeResult.raw.groundStation.number) {
        decodeResult.formatted.items.push({
          type: 'ground_station',
          label: 'Ground Station',
          value: `${decodeResult.raw.groundStation.icaoCode}${decodeResult.raw.groundStation.number}`,
        });
      }
      if (decodeResult.raw.groundStation.iataCode) {
        decodeResult.formatted.items.push({
          type: 'iataCode',
          label: 'IATA',
          value: decodeResult.raw.groundStation.iataCode,
        });
      }
      if (decodeResult.raw.groundStation.icaoCode) {
        decodeResult.formatted.items.push({
          type: 'icaoCode',
          label: 'ICAO',
          value: decodeResult.raw.groundStation.icaoCode,
        });
      }
      if (decodeResult.raw.groundStation.coordinates.latitude) {
        decodeResult.formatted.items.push({
          type: 'coordinates',
          label: 'Ground Station Location',
          value: `${decodeResult.raw.groundStation.coordinates.latitude}, ${decodeResult.raw.groundStation.coordinates.longitude}`,
        });
      }
      if (decodeResult.raw.groundStation.airport) {
        decodeResult.formatted.items.push({
          type: 'airport',
          label: 'Airport',
          value: `${decodeResult.raw.groundStation.airport.name} (${decodeResult.raw.groundStation.airport.icao}) in ${decodeResult.raw.groundStation.airport.location}`,
        });
      }
    }

    if (decodeResult.raw.vdlFrequency) {
      decodeResult.formatted.items.push({
        type: 'vdlFrequency',
        label: 'VDL Frequency',
        value: `${decodeResult.raw.vdlFrequency} MHz`
      });
    }
    decodeResult.decoded = true;
    decodeResult.decoder.decodeLevel = 'full';

    return decodeResult;
  }
}

export default {};
