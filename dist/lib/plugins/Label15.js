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
// General Aviation Position Report
var Label15 = /** @class */ (function (_super) {
    __extends(Label15, _super);
    function Label15() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'label-5z';
        return _this;
    }
    Label15.prototype.qualifiers = function () {
        return {
            labels: ['15'],
            preambles: ['(2'],
        };
    };
    Label15.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        decodeResult.decoder.name = this.name;
        decodeResult.formatted.description = 'Position Report';
        var twoZeeRegex = /^\(2(?<between>.+)\(Z$/;
        var results = message.text.match(twoZeeRegex);
        if (results) {
            // Style: (2N38111W 82211266 76400-64(Z
            console.log("Label 15 Position Report: between = " + results.groups.between);
            decodeResult.raw.latitude_direction = results.groups.between.substr(0, 1);
            decodeResult.raw.latitude = Number(results.groups.between.substr(1, 5)) / 1000;
            decodeResult.raw.longitude_direction = results.groups.between.substr(6, 1);
            decodeResult.raw.longitude = Number(results.groups.between.substr(7, 6)) / 1000;
            decodeResult.remaining.text = results.groups.between.substr(13);
            decodeResult.formatted.items.coordinates = {
                label: 'Coordinates',
                value: decodeResult.raw.latitude + " " + decodeResult.raw.latitude_direction + ", " + decodeResult.raw.longitude + " " + decodeResult.raw.longitude_direction,
            };
        }
        decodeResult.decoded = true;
        decodeResult.decoder.decodeLevel = 'partial';
        return decodeResult;
    };
    return Label15;
}(DecoderPlugin_1.DecoderPlugin));
exports.Label15 = Label15;
exports.default = {};
