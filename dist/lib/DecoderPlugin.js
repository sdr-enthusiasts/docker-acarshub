"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var DecoderPlugin = /** @class */ (function () {
    function DecoderPlugin(decoder, options) {
        if (options === void 0) { options = {}; }
        this.name = 'unknown';
        this.defaultResult = {
            decoded: false,
            decoder: {
                name: 'unknown',
                type: 'pattern-match',
                decodeLevel: 'none',
            },
            formatted: {
                description: 'Unknown',
                items: {},
            },
            raw: {},
            remaining: {},
        };
        this.decoder = decoder;
        this.options = options;
    }
    DecoderPlugin.prototype.id = function () {
        console.log('DecoderPlugin subclass has not overriden id() to provide a unique ID for this plugin!');
        return 'abstract_decoder_plugin';
    };
    DecoderPlugin.prototype.meetsStateRequirements = function () {
        return true;
    };
    // onRegister(store: Store<any>) {
    //   this.store = store;
    // }
    DecoderPlugin.prototype.qualifiers = function () {
        var labels = [];
        return {
            labels: labels,
        };
    };
    DecoderPlugin.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        decodeResult.remaining.text = message.text;
        return decodeResult;
    };
    return DecoderPlugin;
}());
exports.DecoderPlugin = DecoderPlugin;
exports.default = {};
