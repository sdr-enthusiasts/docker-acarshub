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
var Label5Z = /** @class */ (function (_super) {
    __extends(Label5Z, _super);
    function Label5Z() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Label5Z.prototype.qualifiers = function () {
        return {
            labels: ['5Z'],
        };
    };
    Label5Z.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        if (message.text.includes('#M1BPOS')) {
            console.log('DECODER: #M1BPOS detected');
            var parts = message.text.replace('#M1BPOS', '').split('/')[0].split(',');
            // console.log(parts);
            var coordsRegex = /(?<lac>[NS])(?<la>\d+)(?<lnc>[EW])(?<ln>\d+)/;
            var results = parts[0].match(coordsRegex);
            // console.log(results);
            if (results && results.length >= 4) {
                decodeResult.raw.latitude = results.groups.la / 1000;
                decodeResult.raw.longitude = results.groups.ln / 1000;
                var route = parts.slice(1).filter(function (part) { return !/^\d(.+)$/.test(part); });
                route = route.map(function (hop) { return hop || '?'; });
                decodeResult.formatted.coordinates = {
                    label: 'Coordinates',
                    value: decodeResult.raw.latitude + " " + results.groups.lac + ", " + decodeResult.raw.longitude + " " + results.groups.lnc,
                };
                decodeResult.formatted.route = {
                    label: 'Route',
                    value: "" + route.join(' > '),
                };
            }
            decodeResult.formatted.description = 'Position Report';
        }
        if (message.text.includes('#M1BPRG')) {
            console.log('DECODER: #M1BPRG detected');
            var parts = message.text.split('/');
            for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) { // eslint-disable-line no-restricted-syntax
                var part = parts_1[_i];
                if (part.includes('#M')) {
                    var regex = /#M(?<fms>\w+)PRG/;
                }
                if (part.includes('DT')) {
                    var regex = /DT(?<dest>\w+),(?<rway>.+),(?<fuel>.+),(?<eta>.+),(?<rem>.+)/;
                    var result = message.text.match(regex);
                    // console.log('DT result');
                    // console.log(result);
                }
                if (part.includes('FN')) {
                    var regex = /FN(?<flight>\w+)/;
                }
            }
        }
        return decodeResult;
    };
    return Label5Z;
}(DecoderPlugin_1.DecoderPlugin));
exports.Label5Z = Label5Z;
exports.default = {};
