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
var LabelColonComma = /** @class */ (function (_super) {
    __extends(LabelColonComma, _super);
    function LabelColonComma() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'label-colon-comma';
        return _this;
    }
    LabelColonComma.prototype.qualifiers = function () {
        return {
            labels: [':;'],
        };
    };
    LabelColonComma.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        decodeResult.decoder.name = this.name;
        decodeResult.raw.frequency = Number(message.text) / 1000;
        decodeResult.formatted.description = 'Aircraft Transceiver Frequency Change';
        decodeResult.formatted.items.frequency = {
            label: 'Frequency',
            value: decodeResult.raw.frequency + " MHz",
        };
        decodeResult.decoded = true;
        decodeResult.decoder.decodeLevel = 'full';
        return decodeResult;
    };
    return LabelColonComma;
}(DecoderPlugin_1.DecoderPlugin));
exports.LabelColonComma = LabelColonComma;
exports.default = {};
