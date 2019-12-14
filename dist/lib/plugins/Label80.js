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
// Airline Defined
// 3N01 POSRPT
var Label80 = /** @class */ (function (_super) {
    __extends(Label80, _super);
    function Label80() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'label-80';
        _this.descriptions = {
            ALT: 'Altitude',
            DWND: 'Unknown',
            ETA: 'Estimated Time of Arrival',
            FOB: 'Fuel on Board',
            FL: 'Flight Level',
            HDG: 'Heading',
            MCH: 'Aircraft Speed',
            NWYP: 'Next Waypoint',
            POS: 'Aircraft Position',
            SAT: 'Static Air Temperature',
            SWND: 'Unknown',
            TAS: 'True Airspeed',
            WYP: 'Waypoint',
        };
        return _this;
    }
    Label80.prototype.qualifiers = function () {
        return {
            labels: ['80'],
            preambles: ['3N01 POSRPT'],
        };
    };
    Label80.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        decodeResult.decoder.name = this.name;
        decodeResult.formatted.description = 'Airline Defined Position Report';
        var parts = message.text.split('\n');
        var posRptRegex = /^3N01 POSRPT \d\d\d\d\/\d\d (?<orig>\w+)\/(?<dest>\w+) \.(?<tail>[\w-]+)(\/(?<agate>.+) (?<sta>\w+:\w+))*/; // eslint-disable-line max-len
        var results = parts[0].match(posRptRegex);
        if (results && results.length > 0) {
            decodeResult.formatted.items.origin = {
                label: 'Origin',
                value: "" + results.groups.orig,
            };
            decodeResult.formatted.items.destination = {
                label: 'Destination',
                value: "" + results.groups.dest,
            };
            decodeResult.formatted.items.tail = {
                label: 'Tail',
                value: "" + results.groups.tail,
            };
            if (results.groups.agate) {
                decodeResult.formatted.items.arrival_gate = {
                    label: 'Arrival Gate',
                    value: "" + results.groups.agate,
                };
                decodeResult.formatted.items.sta = {
                    label: 'Scheduled Time of Arrival',
                    value: "" + results.groups.sta,
                };
            }
            posRptRegex = /\/(?<field>\w+)\s(?<value>[\w\+\-:\.^\s]+)/g; // eslint-disable-line no-useless-escape
            var remainingParts = parts.slice(1);
            for (var _i = 0, remainingParts_1 = remainingParts; _i < remainingParts_1.length; _i++) { // eslint-disable-line no-restricted-syntax
                var part = remainingParts_1[_i];
                results = part.matchAll(posRptRegex);
                console.log(results);
                if (results) {
                    for (var _a = 0, results_1 = results; _a < results_1.length; _a++) { // eslint-disable-line no-restricted-syntax
                        var result = results_1[_a];
                        switch (result.groups.field) {
                            case 'ALT': {
                                decodeResult.formatted.items.altitude = {
                                    label: this.descriptions[result.groups.field],
                                    value: result.groups.value + " feet",
                                };
                                break;
                            }
                            case 'MCH': {
                                decodeResult.formatted.items.mach = {
                                    label: this.descriptions[result.groups.field],
                                    value: result.groups.value / 1000 + " Mach",
                                };
                                break;
                            }
                            case 'POS': {
                                var posRegex = /^(?<latd>[NS])(?<lat>.+)(?<lngd>[EW])(?<lng>.+)/;
                                var posResult = result.groups.value.match(posRegex);
                                var latitude = (Number(posResult.groups.lat) / 1000) * (posResult.groups.lngd === 'S' ? -1 : 1);
                                var longitude = (Number(posResult.groups.lng) / 1000) * (posResult.groups.lngd === 'W' ? -1 : 1);
                                decodeResult.raw.aircraft_position = {
                                    latitude: latitude,
                                    longitude: longitude,
                                };
                                decodeResult.formatted.items.position = {
                                    label: this.descriptions[result.groups.field],
                                    value: (Number(posResult.groups.lat) / 1000).toPrecision(5) + " " + posResult.groups.latd + ", " + (Number(posResult.groups.lng) / 1000).toPrecision(5) + " " + posResult.groups.lngd,
                                };
                                break;
                            }
                            default: {
                                var description = this.descriptions[result.groups.field] ? this.descriptions[result.groups.field] : 'Unknown';
                                decodeResult.formatted.items[result.groups.field] = {
                                    code: result.groups.field,
                                    label: description || "Unknown (" + result.groups.field + ")",
                                    value: "" + result.groups.value,
                                };
                            }
                        }
                    }
                }
            }
            decodeResult.decoded = true;
            decodeResult.decodeLevel = 'partial';
        }
        return decodeResult;
    };
    return Label80;
}(DecoderPlugin_1.DecoderPlugin));
exports.Label80 = Label80;
exports.default = {};
