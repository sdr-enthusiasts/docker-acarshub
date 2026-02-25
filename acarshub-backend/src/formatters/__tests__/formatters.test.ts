// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import { describe, expect, it } from "vitest";
import {
  countErrors,
  formatAcarsMessage,
  formatHfdlMessage,
  formatIrdmMessage,
  formatJaeroImslMessage,
  formatSatdumpImslMessage,
  formatVdlm2Message,
} from "../index.js";

describe("Message Formatters", () => {
  describe("countErrors", () => {
    it("counts errors in flat object", () => {
      const message = {
        field1: "value",
        err: true,
        field2: 123,
      };

      expect(countErrors(message)).toBe(1);
    });

    it("counts errors in nested object", () => {
      const message = {
        level1: {
          err: true,
          level2: {
            err: true,
            field: "value",
          },
        },
        field: "test",
      };

      expect(countErrors(message)).toBe(2);
    });

    it("ignores err: false", () => {
      const message = {
        err: false,
        nested: {
          err: false,
        },
      };

      expect(countErrors(message)).toBe(0);
    });

    it("returns 0 for message with no errors", () => {
      const message = {
        field1: "value",
        field2: 123,
        nested: {
          field3: "test",
        },
      };

      expect(countErrors(message)).toBe(0);
    });

    it("handles arrays in message", () => {
      const message = {
        items: [{ err: true }, { err: true }],
        err: true,
      };

      // Arrays are skipped, only top-level err counted
      expect(countErrors(message)).toBe(1);
    });
  });

  describe("formatAcarsMessage - Router", () => {
    it("routes VDLM2 messages", () => {
      const message = {
        vdl2: {
          t: { sec: 1234567890 },
          station: "TEST",
          avlc: {
            dst: { addr: "123456" },
            src: { addr: "ABCDEF" },
          },
        },
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.timestamp).toBe(1234567890);
      expect(result?.station_id).toBe("TEST");
    });

    it("routes HFDL messages", () => {
      const message = {
        hfdl: {
          t: { sec: 1234567890 },
          station: "SAN",
          freq: 8936000,
        },
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.timestamp).toBe(1234567890);
      expect(result?.freq).toBe("8.936");
    });

    it("routes SatDump IMSL messages", () => {
      const message = {
        source: {
          app: {
            name: "SatDump",
          },
          station_id: "TEST",
        },
        msg_name: "ACARS",
        timestamp: 1234567890,
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.timestamp).toBe(1234567890);
      expect(result?.station_id).toBe("TEST");
    });

    it("routes JAERO IMSL messages", () => {
      const message = {
        app: {
          name: "JAERO",
        },
        t: { sec: 1234567890 },
        station: "TEST",
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.timestamp).toBe(1234567890);
      expect(result?.station_id).toBe("TEST");
    });

    it("routes IRDM messages", () => {
      const message = {
        app: {
          name: "iridium-toolkit",
        },
        freq: 1626000000,
        source: {
          station_id: "TEST",
        },
        acars: {
          timestamp: "2024-01-01T00:00:00Z",
        },
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.station_id).toBe("TEST");
    });

    it("normalizes raw ACARS numeric ICAO to hex", () => {
      const message = {
        icao: 11259375,
        timestamp: 1234567890,
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.icao).toBe("ABCDEF");
    });

    it("normalizes raw ACARS hex string ICAO to uppercase", () => {
      const message = {
        icao: "abcdef",
        timestamp: 1234567890,
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.icao).toBe("ABCDEF");
    });

    it("converts raw ACARS decimal string ICAO to hex", () => {
      const message = {
        icao: "11259375",
        timestamp: 1234567890,
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeDefined();
      expect(result?.icao).toBe("ABCDEF");
    });

    it("returns null for SatDump non-ACARS messages", () => {
      const message = {
        source: {
          app: {
            name: "SatDump",
          },
        },
        msg_name: "OTHER",
      };

      const result = formatAcarsMessage(message);
      expect(result).toBeNull();
    });
  });

  describe("formatIrdmMessage", () => {
    it("formats complete IRDM message", () => {
      const message = {
        freq: 1626270833.33,
        level: -42.5,
        source: {
          station_id: "IRDM-TEST",
        },
        acars: {
          timestamp: "2024-01-15T12:30:00Z",
          errors: 2,
          block_end: true,
          mode: "2",
          tail: "N12345",
          flight: "AAL123",
          label: "H1",
          block_id: "1",
          message_number: "M42A",
          ack: "!",
          text: "TEST MESSAGE",
        },
      };

      const result = formatIrdmMessage(message);

      // Frequency should be channelized
      expect(result.freq).toMatch(/^1626\.\d{6}$/);
      expect(result.level).toBe("-42.5");
      expect(result.station_id).toBe("IRDM-TEST");
      expect(result.error).toBe(2);
      expect(result.end).toBe(true);
      expect(result.mode).toBe("2");
      expect(result.tail).toBe("N12345");
      expect(result.flight).toBe("AAL123");
      expect(result.label).toBe("H1");
      expect(result.block_id).toBe("1");
      expect(result.msgno).toBe("M42A");
      expect(result.ack).toBe("!");
      expect(result.text).toBe("TEST MESSAGE");
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it("sets default timestamp when missing", () => {
      const message = {
        freq: 1626000000,
        source: { station_id: "TEST" },
        acars: {},
      };

      const result = formatIrdmMessage(message);
      expect(result.timestamp).toBeGreaterThan(1700000000); // After 2023
    });

    it("handles missing optional fields", () => {
      const message = {
        source: { station_id: "TEST" },
        acars: {
          timestamp: "2024-01-01T00:00:00Z",
        },
      };

      const result = formatIrdmMessage(message);
      expect(result.station_id).toBe("TEST");
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.freq).toBeUndefined();
      expect(result.level).toBeUndefined();
    });
  });

  describe("formatJaeroImslMessage", () => {
    it("formats complete JAERO message", () => {
      const message = {
        t: { sec: 1705324800 },
        station: "JAERO-STN",
        isu: {
          acars: {
            msg_text: "JAERO TEST MESSAGE",
            arinc622: {
              gs_addr: "KZNYXCXA",
              some_data: "value",
            },
            ack: "!",
            blk_id: "2",
            label: "5Z",
            mode: "2",
            reg: "N98765",
          },
          dst: {
            addr: "A1B2C3",
          },
          src: {
            addr: "D4E5F6",
          },
          refno: 42,
        },
      };

      const result = formatJaeroImslMessage(message);

      expect(result.timestamp).toBe(1705324800);
      expect(result.station_id).toBe("JAERO-STN");
      expect(result.text).toBe("JAERO TEST MESSAGE");
      expect(result.fromaddr_decoded).toBe("KZNYXCXA");
      expect(result.ack).toBe("!");
      expect(result.block_id).toBe("2");
      expect(result.label).toBe("5Z");
      expect(result.mode).toBe("2");
      expect(result.tail).toBe("N98765");
      expect(result.toaddr).toBe(0xa1b2c3);
      expect(result.icao).toBe("A1B2C3");
      expect(result.fromaddr).toBe(0xd4e5f6);
      expect(result.msgno).toBe("42");

      // Check libacars is JSON string
      expect(result.libacars).toBeDefined();
      const libacars = JSON.parse(result.libacars as string);
      expect(libacars.gs_addr).toBe("KZNYXCXA");
    });

    it("counts errors correctly", () => {
      const message = {
        t: { sec: 1705324800 },
        station: "TEST",
        err: true,
        isu: {
          err: true,
          acars: {
            err: true,
          },
        },
      };

      const result = formatJaeroImslMessage(message);
      expect(result.error).toBe(3);
    });

    it("sets default timestamp when missing", () => {
      const message = {
        station: "TEST",
        isu: {},
      };

      const result = formatJaeroImslMessage(message);
      expect(result.timestamp).toBeGreaterThan(1700000000);
    });
  });

  describe("formatSatdumpImslMessage", () => {
    it("formats complete SatDump message", () => {
      const message = {
        timestamp: 1705324800,
        source: {
          station_id: "SATDUMP-STN",
        },
        freq: 1545.0,
        level: -35.2,
        mode: "2",
        label: "H\x7f",
        bi: "3",
        message: "SATDUMP TEST",
        more_to_come: false,
        plane_reg: "N.1.2.3.4.5",
        tak: 0x15,
        libacars: {
          some: "data",
        },
        flight: "UAL456",
        fromaddr_decoded: "KZOBXCXA",
        signal_unit: {
          aes_id: "123ABC",
          ges_id: 999,
          ref_no: 77,
        },
      };

      const result = formatSatdumpImslMessage(message);

      expect(result.timestamp).toBe(1705324800);
      expect(result.station_id).toBe("SATDUMP-STN");
      expect(result.freq).toBe(1545.0);
      expect(result.level).toBe(-35.2);
      expect(result.mode).toBe("2");
      expect(result.label).toBe("Hd"); // \x7f replaced with 'd'
      expect(result.block_id).toBe("3");
      expect(result.text).toBe("SATDUMP TEST");
      expect(result.end).toBe(true); // more_to_come inverted
      expect(result.tail).toBe("N12345"); // dots removed
      expect(result.ack).toBe("!"); // \x15 replaced with '!'
      expect(result.flight).toBe("UAL456");
      expect(result.fromaddr_decoded).toBe("KZOBXCXA");
      expect(result.toaddr).toBe(0x123abc);
      expect(result.icao).toBe("123ABC");
      expect(result.fromaddr).toBe(999);
      expect(result.msgno).toBe("77");

      // Check libacars
      expect(result.libacars).toBeDefined();
      const libacars = JSON.parse(result.libacars as string);
      expect(libacars.some).toBe("data");
    });

    it("handles more_to_come = true", () => {
      const message = {
        timestamp: 1705324800,
        more_to_come: true,
      };

      const result = formatSatdumpImslMessage(message);
      expect(result.end).toBe(false);
    });

    it("sets default timestamp when missing", () => {
      const message = {
        source: { station_id: "TEST" },
      };

      const result = formatSatdumpImslMessage(message);
      expect(result.timestamp).toBeGreaterThan(1700000000);
    });
  });

  describe("formatHfdlMessage", () => {
    it("formats complete HFDL message", () => {
      const message = {
        hfdl: {
          t: { sec: 1705324800 },
          station: "SAN-FRANCISCO",
          freq: 8936000,
          sig_level: -42.567,
          spdu: {
            some: "data",
          },
          lpdu: {
            dst: { addr: "123456" },
            src: { addr: "ABCDEF" },
            ac_info: { icao: "a1b2c3" },
            hfnpdu: {
              flight_id: "DAL789",
              pos: {
                lat: 37.7749,
                lon: -122.4194,
              },
              freq_data: {
                some: "freq_info",
              },
              acars: {
                ack: "!",
                reg: "N.9.8.7.6.5",
                label: "16",
                blk_id: "4",
                msg_num: "M12",
                msg_num_seq: "A",
                mode: "2",
                msg_text: "HFDL TEST MESSAGE",
                arinc622: {
                  decoded: "info",
                },
              },
            },
          },
        },
      };

      const result = formatHfdlMessage(message);

      expect(result.timestamp).toBe(1705324800);
      expect(result.station_id).toBe("SAN-FRANCISCO");
      expect(result.freq).toBe("8.936");
      expect(result.level).toBe(-42.5); // Truncated to 1 decimal
      expect(result.toaddr).toBe(0x123456);
      expect(result.fromaddr).toBe(0xabcdef);
      expect(result.icao).toBe("A1B2C3");
      expect(result.flight).toBe("DAL789");
      expect(result.lat).toBe(37.7749);
      expect(result.lon).toBe(-122.4194);
      expect(result.ack).toBe("!");
      expect(result.tail).toBe("N98765"); // dots removed
      expect(result.label).toBe("16");
      expect(result.block_id).toBe("4");
      expect(result.msgno).toBe("M12A"); // sequence appended
      expect(result.mode).toBe("2");
      expect(result.text).toBe("HFDL TEST MESSAGE");

      // Check libacars
      expect(result.libacars).toBeDefined();
      const libacars = JSON.parse(result.libacars as string);
      expect(libacars.spdu).toBeDefined();
      expect(libacars.freq_data).toBeDefined();
      expect(libacars.arinc622).toBeDefined();
    });

    it("formats frequency correctly", () => {
      const message = {
        hfdl: {
          t: { sec: 1705324800 },
          freq: 13312000,
        },
      };

      const result = formatHfdlMessage(message);
      expect(result.freq).toBe("13.312");
    });

    it("removes trailing .0 from frequency", () => {
      const message = {
        hfdl: {
          t: { sec: 1705324800 },
          freq: 10000000,
        },
      };

      const result = formatHfdlMessage(message);
      expect(result.freq).toBe("10");
    });

    it("sets default timestamp when hfdl field missing", () => {
      const message = {};

      const result = formatHfdlMessage(message);
      expect(result.timestamp).toBeGreaterThan(1700000000);
    });

    it("counts errors in nested structure", () => {
      const message = {
        hfdl: {
          t: { sec: 1705324800 },
          err: true,
          lpdu: {
            err: true,
            hfnpdu: {
              err: true,
            },
          },
        },
      };

      const result = formatHfdlMessage(message);
      expect(result.error).toBe(3);
    });
  });

  describe("formatVdlm2Message", () => {
    it("formats complete VDLM2 message", () => {
      const message = {
        vdl2: {
          t: { sec: 1705324800 },
          station: "VDL-STATION",
          freq: 136975,
          sig_level: -38.456,
          hdr_bits_fixed: 3,
          avlc: {
            dst: { addr: "123456" },
            src: {
              addr: "abcdef",
              type: "Aircraft",
              status: "Airborne",
            },
            cr: "Response",
            xid: {
              vdl_params: [
                {
                  name: "dst_airport",
                  value: "KJFK",
                },
                {
                  name: "ac_location",
                  value: {
                    loc: {
                      lat: 40.6413,
                      lon: -73.7781,
                    },
                    alt: 35000,
                  },
                },
              ],
            },
            acars: {
              msg_text: "VDLM2 TEST MESSAGE",
              reg: "N.5.4.3.2.1",
              flight: "SWA999",
              ack: "!",
              mode: "2",
              label: "H1",
              blk_id: "5",
              msg_num: "M99",
              msg_num_seq: "B",
              arinc622: {
                decoded: "data",
              },
            },
          },
        },
      };

      const result = formatVdlm2Message(message);

      expect(result.timestamp).toBe(1705324800);
      expect(result.station_id).toBe("VDL-STATION");
      expect(result.freq).toBe(136.975);
      expect(result.level).toBe(-38.4); // Truncated to 1 decimal
      expect(result.error).toBe(3);
      expect(result.toaddr).toBe(0x123456);
      expect(result.fromaddr).toBe(0xabcdef);
      expect(result.icao).toBe("ABCDEF"); // Uppercase
      expect(result.is_onground).toBe(0); // Airborne
      expect(result.is_response).toBe(1);
      expect(result.dsta).toBe("KJFK");
      expect(result.lat).toBe(40.6413);
      expect(result.lon).toBe(-73.7781);
      expect(result.alt).toBe(35000);
      expect(result.text).toBe("VDLM2 TEST MESSAGE");
      expect(result.tail).toBe("N54321"); // dots removed
      expect(result.flight).toBe("SWA999");
      expect(result.ack).toBe("!");
      expect(result.mode).toBe("2");
      expect(result.label).toBe("H1");
      expect(result.block_id).toBe("5");
      expect(result.msgno).toBe("M99B"); // sequence appended

      // Check libacars
      expect(result.libacars).toBeDefined();
      const libacars = JSON.parse(result.libacars as string);
      expect(libacars.decoded).toBe("data");
    });

    it("handles ground aircraft", () => {
      const message = {
        vdl2: {
          t: { sec: 1705324800 },
          avlc: {
            src: {
              addr: "123456",
              type: "Aircraft",
              status: "On ground",
            },
            dst: { addr: "ABCDEF" },
          },
        },
      };

      const result = formatVdlm2Message(message);
      expect(result.is_onground).toBe(2);
    });

    it("does not set ICAO for non-aircraft source", () => {
      const message = {
        vdl2: {
          t: { sec: 1705324800 },
          avlc: {
            src: {
              addr: "123456",
              type: "Ground station",
            },
            dst: { addr: "ABCDEF" },
          },
        },
      };

      const result = formatVdlm2Message(message);
      expect(result.icao).toBeUndefined();
    });

    it("formats frequency with proper decimals", () => {
      const message = {
        vdl2: {
          t: { sec: 1705324800 },
          freq: 136700,
          avlc: {
            dst: { addr: "123456" },
            src: { addr: "ABCDEF" },
          },
        },
      };

      const result = formatVdlm2Message(message);
      expect(result.freq).toBe(136.7);
    });

    it("ensures at least one decimal digit in frequency", () => {
      const message = {
        vdl2: {
          t: { sec: 1705324800 },
          freq: 136000,
          avlc: {
            dst: { addr: "123456" },
            src: { addr: "ABCDEF" },
          },
        },
      };

      const result = formatVdlm2Message(message);
      expect(result.freq).toBe(136.0);
    });

    it("sets default timestamp when vdl2 field missing", () => {
      const message = {};

      const result = formatVdlm2Message(message);
      expect(result.timestamp).toBeGreaterThan(1700000000);
    });
  });
});
