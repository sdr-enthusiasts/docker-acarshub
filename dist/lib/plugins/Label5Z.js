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
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'label-5z';
        _this.descriptions = {
            B1: 'Request Weight and Balance',
            B3: 'Request Departure Clearance',
            CD: 'Weight and Balance',
            CG: 'Request Pre-departure clearance, PDC',
            CM: 'Crew Scheduling',
            C3: 'Off Message',
            C4: 'Flight Dispatch',
            C5: 'Maintenance Message',
            C6: 'Customer Service',
            10: 'PIREP',
            C11: 'International PIREP',
            DS: 'Late Message',
            D3: 'Holding Pattern Message',
            D6: 'From-To + Date',
            D7: 'From-To + Alternate + Time',
            EO: 'In Range',
            PW: 'Position Weather',
            RL: 'Request Release',
            R3: 'Request HOWGOZIT Message',
            R4: 'Request the Latest POSBD',
            TC: 'From-To Fuel',
            WB: 'From-To',
            W1: 'Request Weather for City',
        };
        return _this;
    }
    Label5Z.prototype.qualifiers = function () {
        return {
            labels: ['5Z'],
        };
    };
    Label5Z.prototype.decode = function (message) {
        var decodeResult = this.defaultResult;
        decodeResult.decoder.name = this.name;
        decodeResult.formatted.description = 'Airline Designated Downlink';
        var uaRegex = /^\/(?<type>\w+) (?<remainder>.+)/;
        var results = message.text.match(uaRegex);
        if (results && results.length >= 2) {
            // Successful match: United Airlines 5Z message
            var type = results.groups.type.split('/')[0];
            var remainder = results.groups.remainder;
            console.log(results);
            console.log("DECODER: Matched 'United Airlines 5Z': type = " + type + ", remainder = " + remainder);
            var typeDescription = this.descriptions[type] ? this.descriptions[type] : 'Unknown';
            decodeResult.formatted.items.airline = {
                label: 'Airline',
                value: 'United Airlines',
            };
            decodeResult.formatted.items.type = {
                label: 'Message Type',
                value: typeDescription + " (" + type + ")",
            };
            if (type === 'B3') {
                var rdcRegex = /^(?<from>\w\w\w)(?<to>\w\w\w) (?<unknown1>\d\d) R(?<runway>.+) G(?<unknown2>.+)$/; // eslint-disable-line max-len
                results = remainder.match(rdcRegex);
                if (results) {
                    decodeResult.formatted.items.origin = {
                        label: 'Origin',
                        value: "" + results.groups.from,
                    };
                    decodeResult.formatted.items.origin = {
                        label: 'Destination',
                        value: "" + results.groups.to,
                    };
                    decodeResult.formatted.items.origin = {
                        label: 'Unknown Field 1',
                        value: "" + results.groups.unknown1,
                    };
                    decodeResult.formatted.items.origin = {
                        label: 'Runway',
                        value: "" + results.groups.runway,
                    };
                    decodeResult.formatted.items.origin = {
                        label: 'Unknown Field 2',
                        value: "" + results.groups.unknown2,
                    };
                }
                else {
                    console.log("Unkown 5Z RDC format: " + remainder);
                }
            }
            else {
                decodeResult.remaining.text = remainder;
            }
            decodeResult.decoded = true;
            decodeResult.decoder.decodeLevel = 'partial';
        }
        else {
            // Unknown
            console.log("Unknown 5Z message: " + message.text);
            decodeResult.remaining.text = message.text;
            decodeResult.decoded = false;
            decodeResult.decoder.decodeLevel = 'none';
        }
        return decodeResult;
    };
    return Label5Z;
}(DecoderPlugin_1.DecoderPlugin));
exports.Label5Z = Label5Z;
exports.default = {};
