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
import type { AcarsMsg } from "../../types";
import { mergeMultiPartMessage, mergeStringArrays } from "../messageDecoder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(overrides: Partial<AcarsMsg> = {}): AcarsMsg {
  return {
    uid: "test-uid",
    timestamp: 1_700_000_000,
    station_id: "TEST",
    toaddr: "",
    fromaddr: "",
    depa: undefined,
    dsta: undefined,
    eta: undefined,
    gtout: undefined,
    gtin: undefined,
    wloff: undefined,
    wlin: undefined,
    lat: undefined,
    lon: undefined,
    alt: undefined,
    text: undefined,
    data: undefined,
    tail: undefined,
    flight: "UAL123",
    icao: undefined,
    freq: undefined,
    ack: undefined,
    mode: undefined,
    label: undefined,
    block_id: undefined,
    msgno: "M01A",
    is_response: undefined,
    is_onground: undefined,
    error: undefined,
    level: undefined,
    message_type: "ACARS",
    matched: false,
    matched_text: undefined,
    matched_icao: undefined,
    matched_flight: undefined,
    matched_tail: undefined,
    duplicates: "0",
    msgno_parts: undefined,
    libacars: undefined,
    decoded_msg: undefined,
    airline: undefined,
    iata_flight: undefined,
    icao_flight: undefined,
    decodedText: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mergeStringArrays
// ---------------------------------------------------------------------------

describe("mergeStringArrays", () => {
  it("returns undefined when both inputs are undefined", () => {
    expect(mergeStringArrays(undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when both inputs are empty arrays", () => {
    expect(mergeStringArrays([], [])).toBeUndefined();
  });

  it("returns undefined when one is undefined and the other is empty", () => {
    expect(mergeStringArrays(undefined, [])).toBeUndefined();
    expect(mergeStringArrays([], undefined)).toBeUndefined();
  });

  it("returns values from a when b is undefined", () => {
    const result = mergeStringArrays(["TERM_A"], undefined);
    expect(result).toEqual(["TERM_A"]);
  });

  it("returns values from b when a is undefined", () => {
    const result = mergeStringArrays(undefined, ["TERM_B"]);
    expect(result).toEqual(["TERM_B"]);
  });

  it("merges two disjoint arrays", () => {
    const result = mergeStringArrays(["TERM_A"], ["TERM_B"]);
    expect(result).toContain("TERM_A");
    expect(result).toContain("TERM_B");
    expect(result).toHaveLength(2);
  });

  it("deduplicates values present in both arrays", () => {
    const result = mergeStringArrays(["EMERGENCY", "MAYDAY"], ["EMERGENCY"]);
    expect(result).toContain("EMERGENCY");
    expect(result).toContain("MAYDAY");
    // EMERGENCY must appear only once
    expect(result?.filter((v) => v === "EMERGENCY")).toHaveLength(1);
    expect(result).toHaveLength(2);
  });

  it("deduplicates when both arrays are identical", () => {
    const result = mergeStringArrays(
      ["TERM_A", "TERM_B"],
      ["TERM_A", "TERM_B"],
    );
    expect(result).toHaveLength(2);
    expect(result).toContain("TERM_A");
    expect(result).toContain("TERM_B");
  });

  it("returns a new array and does not mutate the inputs", () => {
    const a = ["TERM_A"];
    const b = ["TERM_B"];
    const result = mergeStringArrays(a, b);
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
    expect(a).toEqual(["TERM_A"]);
    expect(b).toEqual(["TERM_B"]);
  });
});

// ---------------------------------------------------------------------------
// mergeMultiPartMessage — matched flag carry-forward
// ---------------------------------------------------------------------------

describe("mergeMultiPartMessage — matched flag propagation", () => {
  it("regression: sets matched=true when the new part is matched and existing is not", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      msgno_parts: undefined,
      text: "PART ONE ",
      matched: false,
      matched_text: undefined,
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: true,
      matched_text: ["EMERGENCY"],
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.matched).toBe(true);
    expect(merged.matched_text).toContain("EMERGENCY");
  });

  it("regression: preserves matched=true when the existing part is matched and new part is not", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      msgno_parts: undefined,
      text: "PART ONE ",
      matched: true,
      matched_text: ["MAYDAY"],
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: false,
      matched_text: undefined,
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.matched).toBe(true);
    expect(merged.matched_text).toContain("MAYDAY");
  });

  it("merges matched_text from both parts without duplicates", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      text: "PART ONE ",
      matched: true,
      matched_text: ["TERM_A", "SHARED"],
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: true,
      matched_text: ["TERM_B", "SHARED"],
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.matched).toBe(true);
    expect(merged.matched_text).toContain("TERM_A");
    expect(merged.matched_text).toContain("TERM_B");
    expect(merged.matched_text).toContain("SHARED");
    // SHARED must not appear twice
    expect(merged.matched_text?.filter((v) => v === "SHARED")).toHaveLength(1);
  });

  it("leaves matched=false when neither part is matched", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      text: "PART ONE ",
      matched: false,
      matched_text: undefined,
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: false,
      matched_text: undefined,
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.matched).toBe(false);
    expect(merged.matched_text).toBeUndefined();
  });

  it("merges matched_flight from both parts", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      text: "PART ONE ",
      matched: true,
      matched_flight: ["UAL123"],
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: true,
      matched_flight: ["DAL456"],
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.matched_flight).toContain("UAL123");
    expect(merged.matched_flight).toContain("DAL456");
  });

  it("merges matched_tail from both parts", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      text: "PART ONE ",
      matched: true,
      matched_tail: ["N12345"],
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: true,
      matched_tail: ["N99999"],
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.matched_tail).toContain("N12345");
    expect(merged.matched_tail).toContain("N99999");
  });

  it("merges matched_icao from both parts", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      text: "PART ONE ",
      matched: true,
      matched_icao: ["A1B2C3"],
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: true,
      matched_icao: ["D4E5F6"],
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.matched_icao).toContain("A1B2C3");
    expect(merged.matched_icao).toContain("D4E5F6");
  });

  it("does not mutate the existing or new message objects", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      text: "PART ONE ",
      matched: false,
    });
    const newPart = makeMsg({
      uid: "uid-2",
      msgno: "M02A",
      text: "PART TWO",
      matched: true,
      matched_text: ["EMERGENCY"],
    });

    const existingMatchedBefore = existing.matched;
    const newPartMatchedBefore = newPart.matched;

    mergeMultiPartMessage(existing, newPart);

    // Source objects must be unchanged
    expect(existing.matched).toBe(existingMatchedBefore);
    expect(newPart.matched).toBe(newPartMatchedBefore);
  });

  it("updates the timestamp to the new part's timestamp", () => {
    const existing = makeMsg({ uid: "uid-1", msgno: "M01A", timestamp: 1_000 });
    const newPart = makeMsg({ uid: "uid-2", msgno: "M02A", timestamp: 2_000 });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.timestamp).toBe(2_000);
  });

  it("builds msgno_parts from both message numbers on first merge", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      msgno_parts: undefined,
      text: "PART ONE ",
    });
    const newPart = makeMsg({ uid: "uid-2", msgno: "M02A", text: "PART TWO" });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.msgno_parts).toBe("M01A M02A");
  });

  it("appends to an existing msgno_parts string", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      msgno_parts: "M01A M02A",
      text: "PART ONE PART TWO ",
    });
    const newPart = makeMsg({
      uid: "uid-3",
      msgno: "M03A",
      text: "PART THREE",
    });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.msgno_parts).toBe("M01A M02A M03A");
  });

  it("concatenates text from both parts", () => {
    const existing = makeMsg({
      uid: "uid-1",
      msgno: "M01A",
      text: "HELLO ",
    });
    const newPart = makeMsg({ uid: "uid-2", msgno: "M02A", text: "WORLD" });

    const merged = mergeMultiPartMessage(existing, newPart);

    expect(merged.text).toBe("HELLO WORLD");
  });
});
