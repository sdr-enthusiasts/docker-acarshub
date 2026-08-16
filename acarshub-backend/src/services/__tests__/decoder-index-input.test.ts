// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * decoder-index-input.ts — the shared `AcarsDecodeResult` ->
 * `DecodedMessageForIndex` mapping used by both the live-ingest write path
 * (formatters/enrichment.ts) and the v4.3 Phase 4 rebuild path
 * (search-index-rebuild.ts).
 *
 * This is a FOCUSED unit test over a hand-constructed fake
 * `AcarsDecodeResult` — no database, no real `MessageDecoder` instance. The
 * only other coverage `buildIndexInput()` has is the ingest/rebuild
 * agreement test in search-index-rebuild.test.ts, which passes even if both
 * paths are wrong in the same way (they share this function). These tests
 * pin the mapping's actual field-by-field behaviour independently of that.
 *
 * `decoder-version.ts` is mocked so `decoderVersion` assertions are not
 * coupled to whatever `@airframes/acars-decoder` version happens to be
 * installed, and so the "read fresh, not cached" test can change the mocked
 * return value between two calls against the identical result object.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const decoderVersionState = vi.hoisted(() => ({
  getInstalledDecoderVersion: vi.fn(),
}));

vi.mock("../decoder-version.js", () => ({
  getInstalledDecoderVersion: decoderVersionState.getInstalledDecoderVersion,
}));

import type { AcarsDecodeResult } from "../decoder-index-input.js";
import { buildIndexInput } from "../decoder-index-input.js";

const FAKE_DECODER_VERSION = "1.2.3-fake";

beforeEach(() => {
  decoderVersionState.getInstalledDecoderVersion.mockReturnValue(
    FAKE_DECODER_VERSION,
  );
});

/**
 * Deliberately includes REAL `formatted.items` entries literally labeled
 * "Description" and "Remaining Text" — the exact same strings
 * `formatters/enrichment.ts` uses for its SYNTHETIC display-only entries
 * (built from `formatted.description` and `remaining.text`, not from any
 * item). Also sets `formatted.description` and `remaining.text` to values
 * distinct from those two items' `value`s. If `buildIndexInput()` ever
 * folded the synthetic entries in (or read the wrong source for a field),
 * this fixture is constructed so that mistake is unambiguous rather than
 * accidentally matching by coincidence.
 */
const FIXTURE_RESULT: AcarsDecodeResult = {
  decoded: true,
  decoder: {
    name: "fixture-decoder",
    type: "pattern-match",
    decodeLevel: "full",
  },
  formatted: {
    description: "Fixture Message Type Description",
    items: [
      {
        type: "string",
        code: "DESC",
        label: "Description",
        value: "This is a real item, not the synthetic display entry",
      },
      {
        type: "string",
        code: "ALT",
        label: "Altitude",
        value: "35000",
      },
      {
        type: "string",
        code: "REM",
        label: "Remaining Text",
        value: "This is also a real item, not the synthetic display entry",
      },
    ],
  },
  raw: {},
  remaining: {
    text: "leftover text that formatters/enrichment.ts would fold into a synthetic 'Remaining Text' display entry",
  },
};

describe("buildIndexInput", () => {
  it("takes fieldLabels from formatted.items only, in order, with no synthetic entries folded in", () => {
    const input = buildIndexInput(1, FIXTURE_RESULT);

    // Exactly the three real item labels, in the same order they appear in
    // formatted.items — nothing added, nothing deduplicated away, nothing
    // derived from formatted.description or remaining.text.
    expect(input.fieldLabels).toEqual(["Description", "Altitude", "Remaining Text"]);
    expect(input.fieldLabels).toHaveLength(3);
  });

  it("maps messageId, decoderName, and description from the expected sources", () => {
    const input = buildIndexInput(42, FIXTURE_RESULT);

    expect(input.messageId).toBe(42);
    expect(input.decoderName).toBe("fixture-decoder");
    // From formatted.description, NOT from the item literally labeled
    // "Description" (that item's `value` is a different string entirely).
    expect(input.description).toBe("Fixture Message Type Description");
  });

  it("reads decoderVersion from getInstalledDecoderVersion(), not from anything on the result object", () => {
    decoderVersionState.getInstalledDecoderVersion.mockReturnValue("1.0.0");
    const first = buildIndexInput(1, FIXTURE_RESULT);
    expect(first.decoderVersion).toBe("1.0.0");

    // Same result object, no version field on it anywhere (DecodeResult has
    // none — see the package's .d.ts) — only the mocked reader's return
    // value changed, and the mapping must track that fresh read rather than
    // caching or deriving a version from `result`.
    decoderVersionState.getInstalledDecoderVersion.mockReturnValue("2.0.0");
    const second = buildIndexInput(1, FIXTURE_RESULT);
    expect(second.decoderVersion).toBe("2.0.0");
  });

  it("produces an empty fieldLabels array when formatted.items is empty", () => {
    const emptyItemsResult: AcarsDecodeResult = {
      ...FIXTURE_RESULT,
      formatted: {
        description: FIXTURE_RESULT.formatted.description,
        items: [],
      },
    };

    const input = buildIndexInput(1, emptyItemsResult);

    expect(input.fieldLabels).toEqual([]);
  });
});
