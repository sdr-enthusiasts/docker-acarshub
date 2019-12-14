"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var DecoderPlugin_1 = require("../DecoderPlugin");
var LabelSQ = /** @class */ (function (_super) {
    __extends(LabelSQ, _super);
    function LabelSQ() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'label-sq';
        return _this;
    }
    LabelSQ.prototype.qualifiers = function () {
        return {
            labels: ['SQ'],
        };
    };
    LabelSQ.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        decodeResult.decoder.name = this.name;
        decodeResult.raw.preamble = message.text.substring(0, 4);
        decodeResult.raw.version = message.text.substring(1, 2);
        decodeResult.raw.network = 'Unknown';
        // if (message.text && message.text !== '') {
        //   decodeResult.raw.network = this.store.state.acarsData.labels.SQ.decoderHints.brands[message.text[3]]; // eslint-disable-line max-len
        // }
        if (decodeResult.raw.version === '2') {
            var regex = /0(\d)X(?<org>\w)(?<iata>\w\w\w)(?<icao>\w\w\w\w)(?<station>\d)(?<lat>\d+)(?<latd>[NS])(?<lng>\d+)(?<lngd>[EW])V(?<vfreq>\d+)\/.*/;
            var result = message.text.match(regex);
            if (result.length >= 8) {
                decodeResult.raw.iataCode = result.groups.iata;
                decodeResult.raw.icaoCode = result.groups.icao;
                decodeResult.raw.stationNumber = result.groups.station;
                decodeResult.raw.airport = this.decoder.lookupAirportByIata(decodeResult.raw.iataCode);
                decodeResult.raw.latitude = Number(result.groups.lat) / 100 + " " + result.groups.latd;
                decodeResult.raw.longitude = Number(result.groups.lng) / 100 + " " + result.groups.lngd;
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
                value: "" + decodeResult.raw.icaoCode + decodeResult.raw.stationNumber,
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
                label: 'Coordinates',
                value: decodeResult.raw.latitude + ", " + decodeResult.raw.longitude,
            };
        }
        if (decodeResult.raw.airport) {
            decodeResult.formatted.items.airport = {
                label: 'Airport',
                value: decodeResult.raw.airport.name + " (" + decodeResult.raw.airport.icao + ") in " + decodeResult.raw.airport.location,
            };
        }
        decodeResult.decoded = true;
        decodeResult.decoder.decodeLevel = 'full';
        return decodeResult;
    };
    return LabelSQ;
}(DecoderPlugin_1.DecoderPlugin));
exports.LabelSQ = LabelSQ;
exports.default = {};
