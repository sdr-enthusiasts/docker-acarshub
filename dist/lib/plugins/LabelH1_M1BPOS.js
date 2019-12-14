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
var LabelH1_M1BPOS = /** @class */ (function (_super) {
    __extends(LabelH1_M1BPOS, _super);
    function LabelH1_M1BPOS() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'label-h1-m1bpos';
        return _this;
    }
    LabelH1_M1BPOS.prototype.qualifiers = function () {
        return {
            labels: ['H1'],
            preambles: ['#M1BPOS'],
        };
    };
    LabelH1_M1BPOS.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        decodeResult.decoder.name = this.name;
        console.log('DECODER: #M1BPOS detected');
        var parts = message.text.replace('#M1BPOS', '').split('/');
        var firstHalf = parts[0];
        var secondHalf = parts[1];
        var items = firstHalf.split(',');
        var coordsRegex = /(?<lac>[NS])(?<la>\d+)(?<lnc>[EW])(?<ln>\d+)/;
        var results = items[0].match(coordsRegex);
        if (results && results.length >= 4) {
            decodeResult.raw.latitude = results.groups.la / 1000;
            decodeResult.raw.longitude = results.groups.ln / 1000;
            var route = items.slice(1).filter(function (part) { return !/^\d(.+)$/.test(part); });
            route = route.map(function (hop) { return hop || '?'; });
            decodeResult.raw.route = route;
            decodeResult.formatted.description = 'Position Report';
            decodeResult.formatted.items = {
                coordinates: {
                    label: 'Coordinates',
                    value: decodeResult.raw.latitude + " " + results.groups.lac + ", " + decodeResult.raw.longitude + " " + results.groups.lnc,
                },
                route: {
                    label: 'Route',
                    value: "" + route.join(' > '),
                },
            };
            decodeResult.decoded = true;
            decodeResult.decoder.decodeLevel = 'partial';
        }
        decodeResult.remaining.text = secondHalf;
        return decodeResult;
    };
    return LabelH1_M1BPOS;
}(DecoderPlugin_1.DecoderPlugin));
exports.LabelH1_M1BPOS = LabelH1_M1BPOS;
exports.default = {};
