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

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type FormattedMessage,
  formatAcarsMessage,
  formatXngMessage,
} from "../index.js";
import { decodeAvlcAddresses, type XngEnvelope } from "../xng.js";

/** Real off-air acars_poa envelopes (CS-KABQ-ACARS). */
const CAPTURE_LINES = loadJsonl("xng-acars-capture.jsonl");
/** Source-derived envelopes covering every carrier and body kind. */
const DERIVED_LINES = loadJsonl("xng-derived.jsonl");

function loadJsonl(name: string): XngEnvelope[] {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), {
    encoding: "utf8",
  });
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as XngEnvelope);
}

/** 1-based fixture line, cloned so tests can mutate freely. */
function line(lines: XngEnvelope[], n: number): XngEnvelope {
  const envelope = lines[n - 1];
  if (envelope === undefined) {
    throw new Error(`fixture line ${n} missing`);
  }
  return structuredClone(envelope);
}

function format(envelope: XngEnvelope): FormattedMessage {
  const result = formatXngMessage(envelope);
  if (result === null) {
    throw new Error("expected a formatted message");
  }
  return result;
}

function parseLibacars(message: FormattedMessage): Record<string, unknown> {
  expect(typeof message.libacars).toBe("string");
  return JSON.parse(String(message.libacars)) as Record<string, unknown>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("decodeAvlcAddresses", () => {
  it("decodes the real off-air RR frame from xng's avlc tests", () => {
    expect(decodeAvlcAddresses("1422cc54b20c42b5a1e6f0")).toEqual({
      dst: { addr: "1119AA", kind: "ground_delegated" },
      src: { addr: "AC212D", kind: "aircraft" },
    });
  });

  it("accepts uppercase hex and exactly 8 octets", () => {
    expect(decodeAvlcAddresses("1422CC54B20C42B5")).toEqual({
      dst: { addr: "1119AA", kind: "ground_delegated" },
      src: { addr: "AC212D", kind: "aircraft" },
    });
  });

  it("classifies every address type", () => {
    // Type bits da25/da26/da27 are octet-0 bits 0x10/0x08/0x04.
    const kinds = (octet0: string): string | undefined =>
      decodeAvlcAddresses(`${octet0}000000${octet0}000000`)?.dst.kind;
    expect(kinds("10")).toBe("aircraft");
    expect(kinds("04")).toBe("ground_icao");
    expect(kinds("14")).toBe("ground_delegated");
    expect(kinds("1c")).toBe("all_stations");
    expect(kinds("00")).toBe("reserved");
    expect(kinds("08")).toBe("reserved");
  });

  it("returns null for short, odd-length, or non-hex input", () => {
    expect(decodeAvlcAddresses("0468d2aa")).toBeNull();
    expect(decodeAvlcAddresses("")).toBeNull();
    expect(decodeAvlcAddresses("1422cc54b20c42b5a")).toBeNull();
    expect(decodeAvlcAddresses("1422cc54b20c42zz")).toBeNull();
  });
});

describe("formatAcarsMessage routing", () => {
  it("routes xng envelopes to formatXngMessage", () => {
    const envelope = line(CAPTURE_LINES, 8);
    const routed = formatAcarsMessage(
      envelope as unknown as Record<string, unknown>,
    );
    expect(routed).toEqual(formatXngMessage(line(CAPTURE_LINES, 8)));
    // The raw envelope keys are not passed through.
    expect(routed).not.toHaveProperty("body");
    expect(routed).not.toHaveProperty("source");
    expect(routed?.station_id).toBe("CS-KABQ-ACARS");
  });

  it("returns null for an xng envelope with an unhandled mode", () => {
    const envelope = { ...line(CAPTURE_LINES, 1), mode: "ais" };
    expect(
      formatAcarsMessage(envelope as unknown as Record<string, unknown>),
    ).toBeNull();
  });
});

describe("formatXngMessage — real acars_poa capture", () => {
  it("formats every capture line with station, freq, label, text, timestamp", () => {
    expect(CAPTURE_LINES).toHaveLength(84);
    for (const envelope of CAPTURE_LINES) {
      const result = format(structuredClone(envelope));
      expect(result.station_id).toBe("CS-KABQ-ACARS");
      expect(typeof result.freq).toBe("number");
      expect(result.freq).toBeGreaterThan(129);
      expect(result.freq).toBeLessThan(137);
      expect(typeof result.label).toBe("string");
      expect(typeof result.text).toBe("string");
      expect(result.timestamp).toBeCloseTo(
        Date.parse(envelope.timestamp) / 1000,
        3,
      );
    }
  });

  it("maps a line with ack", () => {
    expect(format(line(CAPTURE_LINES, 4))).toEqual({
      timestamp: Date.parse("2026-10-28T14:54:30.820Z") / 1000,
      station_id: "CS-KABQ-ACARS",
      error: 0,
      freq: 131.55,
      level: -14.9,
      mode: "2",
      label: "_d",
      text: "",
      tail: "N346AJ",
      block_id: "V",
      end: true,
      ack: "8",
    });
  });

  it("maps flight, msg_num and block_id", () => {
    const result = format(line(CAPTURE_LINES, 8));
    expect(result.flight).toBe("AA3047");
    expect(result.msgno).toBe("S40A");
    expect(result.block_id).toBe("0");
    expect(result.ack).toBe("N");
    expect(result.tail).toBe("N955XV");
    expect(result.freq).toBe(131.725);
    expect(result.level).toBe(-13.1);
  });

  it("leaves ack unset when xng omits it (NAK)", () => {
    const result = format(line(CAPTURE_LINES, 1));
    expect(result).not.toHaveProperty("ack");
    expect(result.label).toBe("SQ");
    expect(result.text).toBe("02XAABQKABQ13502N10636WV136975/ARINC");
  });

  it("stores the structured app decode as libacars", () => {
    const result = format(line(CAPTURE_LINES, 11));
    expect(result.label).toBe("BA");
    expect(result.text).toBe("/USADCXA.AT1.N955XV6208EDD400506B");
    expect(parseLibacars(result)).toEqual({
      air_reg: ".N955XV",
      app: "cpdlc",
      crc_ok: true,
      element: "dM0NULL",
      gs_addr: "USADCXA",
      imi: "at1",
      more_elements: false,
      msg_id: 4,
      msg_ref: 4,
      payload_hex: "6208edd400",
      text: "WILCO",
      timestamp: "14:55:20",
    });
  });

  it("maps a reassembled line with assstat", () => {
    const result = format(line(CAPTURE_LINES, 10));
    expect(result.tail).toBe("N833AW");
    expect(result.label).toBe("H1");
    expect(result.block_id).toBe("4");
    expect(result.flight).toBe("AA2760");
    expect(result.msgno).toBe("D06D");
    expect(result.end).toBe(true);
    expect(result.text?.startsWith("#DFBA02/A31902,1,1/CCN833AW")).toBe(true);
    expect(result).not.toHaveProperty("assstat");
    expect(result).not.toHaveProperty("reassembled");
    expect(result).not.toHaveProperty("libacars");
  });
});

describe("formatXngMessage — derived envelopes", () => {
  it("formats every derived line; ACARS bodies keep label/text/station", () => {
    expect(DERIVED_LINES).toHaveLength(12);
    for (const envelope of DERIVED_LINES) {
      const result = format(structuredClone(envelope));
      expect(result.station_id).toBe(envelope.source.station.ident);
      if (envelope.body.type === "acars") {
        expect(result.label).toBe(envelope.body.label);
        expect(result.text).toBe(envelope.body.text);
        expect(result.timestamp).toBeGreaterThan(0);
      } else {
        expect(typeof result.libacars).toBe("string");
      }
    }
  });

  it("vdl2 avlc-rr: addresses, icao, VDLM2 freq", () => {
    const result = format(line(DERIVED_LINES, 1));
    expect(result.toaddr).toBe(0x1119aa);
    expect(result.fromaddr).toBe(0xac212d);
    expect(result.icao).toBe("AC212D");
    expect(result.freq).toBe(136.975);
    expect(result.level).toBe(-12);
    expect(result.error).toBe(0);
    expect(Object.keys(parseLibacars(result))).toEqual(["avlc-rr"]);
  });

  it("vdl2 ACARS: fields mapped, short raw yields no addresses", () => {
    const result = format(line(DERIVED_LINES, 2));
    expect(result.label).toBe("B9");
    expect(result.tail).toBe("HB-IJW");
    expect(result.flight).toBe("LX072K");
    expect(result.msgno).toBe("M06A");
    expect(result.text).toBe("/EHAM.TI2/040EHAMACFFA");
    expect(result.level).toBe(-10.7);
    expect(result).not.toHaveProperty("toaddr");
    expect(result).not.toHaveProperty("fromaddr");
  });

  it("vdl2 ACARS with a real AVLC raw frame decodes addresses", () => {
    const envelope = line(DERIVED_LINES, 2);
    envelope.raw = "1422cc54b20c42b5a1e6f0";
    const result = format(envelope);
    expect(result.toaddr).toBe(0x1119aa);
    expect(result.fromaddr).toBe(0xac212d);
    expect(result.icao).toBe("AC212D");
  });

  it("vdl2 ACARS from a ground station does not set icao", () => {
    const envelope = line(DERIVED_LINES, 2);
    // dst aircraft A6F123, src ground_icao 2C0A55 (xng roundtrip test frame).
    envelope.raw = "b0d846c4860c28ab";
    expect(decodeAvlcAddresses(envelope.raw)).toEqual({
      dst: { addr: "A6F123", kind: "aircraft" },
      src: { addr: "2C0A55", kind: "ground_icao" },
    });
    const result = format(envelope);
    expect(result).not.toHaveProperty("icao");
    expect(result.toaddr).toBe(0xa6f123);
    expect(result.fromaddr).toBe(0x2c0a55);
  });

  it("hfdl ACARS ADS-C: position from the report tag, HFDL freq", () => {
    const result = format(line(DERIVED_LINES, 3));
    expect(result.lat).toBe(52.04017639160156);
    expect(result.lon).toBe(19.80388641357422);
    expect(result.alt).toBe(36004);
    expect(result.freq).toBe("21.931");
    expect(result.level).toBe(-40);
    expect(parseLibacars(result).app).toBe("adsc");
  });

  it("hfdl performance-data: keyed libacars, flight, position", () => {
    const result = format(line(DERIVED_LINES, 4));
    const libacars = parseLibacars(result);
    expect(Object.keys(libacars)).toEqual(["performance-data"]);
    expect(libacars).not.toHaveProperty("freq_data");
    expect(result.flight).toBe("UA0042");
    expect(result.lat).toBe(39.999847412109375);
    expect(result.lon).toBe(-73.00003051757812);
    expect(result.error).toBe(0);
  });

  it("hfdl logon-confirm: icao", () => {
    const result = format(line(DERIVED_LINES, 5));
    expect(result.icao).toBe("A1B2C3");
    expect(result.freq).toBe("8.927");
  });

  it("aero_l ACARS with empty ADS-C tags: IMSL MHz freq, no position", () => {
    const result = format(line(DERIVED_LINES, 6));
    expect(result.freq).toBe(1545);
    expect(result.flight).toBe("AI0142");
    expect(result).not.toHaveProperty("lat");
  });

  it("aero_l log-control: icao from aes_id", () => {
    const result = format(line(DERIVED_LINES, 7));
    expect(result.icao).toBe("C0FFEE");
    expect(Object.keys(parseLibacars(result))).toEqual(["log-control"]);
  });

  it("aero_c r-call-progress: libacars only", () => {
    const result = format(line(DERIVED_LINES, 8));
    expect(result.freq).toBe(3615);
    expect(result).not.toHaveProperty("icao");
    expect(result).not.toHaveProperty("toaddr");
    expect(parseLibacars(result)).toHaveProperty("r-call-progress");
  });

  it("iridium ACARS: label Q0, IRDM freq/level formatting", () => {
    const result = format(line(DERIVED_LINES, 9));
    expect(result.label).toBe("Q0");
    expect(result.text).toBe("");
    expect(result.freq).toBe("1626.083333");
    expect(result.level).toBe("-35.0");
    expect(parseLibacars(result).app).toBe("q_series");
  });

  it("iridium ring-alert: position, IRDM freq formatting", () => {
    const result = format(line(DERIVED_LINES, 10));
    expect(result.lat).toBe(46.58863623451565);
    expect(result.lon).toBe(-26.56505117707799);
    expect(result.freq).toBe("1626.250000");
    expect(result.level).toBe("-30.0");
    expect(result.error).toBe(0);
  });

  it("acars_poa QQ: flat POA fields and nested q_series decode", () => {
    const result = format(line(DERIVED_LINES, 11));
    expect(result.depa).toBe("KEWR");
    expect(result.dsta).toBe("KSWF");
    expect(result.wloff).toBe("2004");
    expect(result.freq).toBe(131.55);
    expect(parseLibacars(result)).toEqual({
      app: "q_series",
      description: "OFF Report",
      kind: "off_report",
      label: "QQ",
    });
  });

  it("crc_ok:false: error from decode.errors, end false", () => {
    const result = format(line(DERIVED_LINES, 12));
    expect(result.error).toBe(3);
    expect(result.end).toBe(false);
    expect(result.text).toBe("PARTIAL");
    expect(result).not.toHaveProperty("ack");
  });
});

describe("formatXngMessage — edge cases", () => {
  it("returns null for an unknown mode", () => {
    expect(
      formatXngMessage({ ...line(CAPTURE_LINES, 1), mode: "adsb" }),
    ).toBeNull();
  });

  it("returns null for an undecoded body", () => {
    const envelope = line(DERIVED_LINES, 1);
    envelope.body = { type: "undecoded" };
    expect(formatXngMessage(envelope)).toBeNull();
  });

  it("falls back to Date.now() for an invalid timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    const envelope = line(CAPTURE_LINES, 1);
    envelope.timestamp = "not a time";
    expect(format(envelope).timestamp).toBe(
      Date.parse("2026-01-02T03:04:05Z") / 1000,
    );
  });

  it("derives error from crc_ok when errors is absent", () => {
    const envelope = line(DERIVED_LINES, 12);
    envelope.decode = { crc_ok: false };
    expect(format(envelope).error).toBe(1);
  });

  it("omits freq/level/station when the envelope lacks them", () => {
    const envelope = line(CAPTURE_LINES, 1);
    envelope.frequency_hz = Number.NaN;
    envelope.signal = {};
    envelope.source = {
      app: { name: "xng", version: "0" },
    } as unknown as XngEnvelope["source"];
    const result = format(envelope);
    expect(result).not.toHaveProperty("freq");
    expect(result).not.toHaveProperty("level");
    expect(result).not.toHaveProperty("station_id");
  });

  it("maps acars_poa flat position/altitude and all string POA fields", () => {
    const envelope = line(DERIVED_LINES, 11);
    envelope.body.app = {
      depa: "KEWR",
      dsta: "KSWF",
      eta: "2130",
      gtout: "2000",
      gtin: "2200",
      wloff: "2004",
      wlin: "2150",
      position: { latitude: 40.69, longitude: -74.17 },
      altitude_ft: 35000,
      wind_dir_deg: 270,
      wind_speed_kt: 40,
      temperature_c: -50,
      true_airspeed_kt: 450,
    };
    const result = format(envelope);
    expect(result).toMatchObject({
      depa: "KEWR",
      dsta: "KSWF",
      eta: "2130",
      gtout: "2000",
      gtin: "2200",
      wloff: "2004",
      wlin: "2150",
      lat: 40.69,
      lon: -74.17,
      alt: 35000,
    });
    expect(result).not.toHaveProperty("libacars");
  });

  it("strips flat POA keys from a top-level structured decode", () => {
    const envelope = line(DERIVED_LINES, 11);
    envelope.body.app = {
      app: "adsc",
      tags: [
        { tag: "earth_ref" },
        { tag: "report", lat: 1.5, lon: 2.5 },
        { tag: "report", lat: 9, lon: 9, alt_ft: 1 },
      ],
      depa: "KEWR",
      position: { latitude: 10, longitude: 20 },
      wind_dir_deg: 90,
    };
    const result = format(envelope);
    // POA position wins over the ADS-C report.
    expect(result.lat).toBe(10);
    expect(result.lon).toBe(20);
    expect(parseLibacars(result)).toEqual({
      app: "adsc",
      tags: [
        { tag: "earth_ref" },
        { tag: "report", lat: 1.5, lon: 2.5 },
        { tag: "report", lat: 9, lon: 9, alt_ft: 1 },
      ],
    });
  });

  it("takes ADS-C position from the first report tag without alt", () => {
    const envelope = line(DERIVED_LINES, 6);
    envelope.body.app = {
      app: "adsc",
      tags: [
        "bogus",
        { tag: "report", lat: "x", lon: 1 },
        { tag: "report", lat: 1.5, lon: 2.5 },
      ],
    };
    const result = format(envelope);
    expect(result.lat).toBe(1.5);
    expect(result.lon).toBe(2.5);
    expect(result).not.toHaveProperty("alt");
  });

  it("non-ACARS: position object, who.icao, src aircraft icao, vdl2 addrs", () => {
    const base = line(DERIVED_LINES, 4);
    base.body = {
      type: "hfdl",
      kind: "k",
      details: { position: { lat: 1, lon: 2 }, who: { icao: "abcdef" } },
    };
    expect(format(base)).toMatchObject({ lat: 1, lon: 2, icao: "ABCDEF" });

    const vdl = line(DERIVED_LINES, 1);
    vdl.body = {
      type: "vdl2",
      kind: "avlc-xid",
      details: {
        dst: { addr: "000001" },
        src: { addr: "abc123", kind: "aircraft" },
        icao: "not-hex",
      },
    };
    expect(format(vdl)).toMatchObject({
      toaddr: 1,
      fromaddr: 0xabc123,
      icao: "ABC123",
    });
  });

  it("non-ACARS: missing details/kind still produces keyed libacars", () => {
    const envelope = line(DERIVED_LINES, 8);
    envelope.body = { type: "aero" };
    const result = format(envelope);
    expect(parseLibacars(result)).toEqual({ aero: {} });
    expect(result).not.toHaveProperty("lat");
  });

  it("non-ACARS hfdl ignores dst/src addresses", () => {
    const envelope = line(DERIVED_LINES, 5);
    envelope.body = {
      type: "hfdl",
      kind: "k",
      details: { src: { addr: "123456", kind: "ground" } },
    };
    const result = format(envelope);
    expect(result).not.toHaveProperty("fromaddr");
    expect(result).not.toHaveProperty("icao");
  });
});
