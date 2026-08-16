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
 * Decoder Search-Index Input Mapping
 *
 * A single shared mapping from a decoder `DecodeResult` onto
 * `DecodedMessageForIndex` (decoded-search-index.ts), so the live-ingest
 * write path (formatters/enrichment.ts) and the v4.3 Phase 4 rebuild path
 * (search-index-rebuild.ts) can never drift and produce different index
 * content for the same message.
 *
 * That drift would be silent: the index would mean different things
 * depending on which path wrote it, and nothing would fail loudly — a
 * rebuild pass would quietly re-intern the corpus under a slightly
 * different shape than ingest does, and the two would only ever be
 * compared by a human reading a diff. Sharing this function instead makes
 * the two paths structurally identical rather than independently
 * maintained.
 *
 * This module intentionally has no compile-time dependency on
 * `formatters/enrichment.ts` (the reverse would create a cycle: enrichment
 * imports this module) and does not instantiate its own `MessageDecoder` —
 * both the ingest path and the rebuild path own their own decoder instance
 * and hand this function only the already-produced `DecodeResult`.
 */

import type { MessageDecoder } from "@airframes/acars-decoder";
import type { DecodedMessageForIndex } from "./decoded-search-index.js";
import { getInstalledDecoderVersion } from "./decoder-version.js";

/**
 * The shape returned by `MessageDecoder.decode()`. Derived via `ReturnType`
 * (rather than hand-duplicated) because `@airframes/acars-decoder` does not
 * export its `DecodeResult` interface — see the package's `.d.ts` and the
 * identical derivation in `formatters/enrichment.ts`.
 */
export type AcarsDecodeResult = ReturnType<MessageDecoder["decode"]>;

/**
 * Build the {@link DecodedMessageForIndex} payload for `messageId` from a
 * decoder result.
 *
 * Reproduces exactly what `formatters/enrichment.ts`'s
 * `indexDecodedMessageAtIngest()` builds today. Note carefully what is
 * NOT included: `fieldLabels` comes from `result.formatted.items` only — it
 * does not carry the synthetic "Description" or "Remaining Text" entries
 * that the DISPLAY `DecodedText` adds in enrichment.ts. That is deliberate:
 * the search index and the display payload are different shapes for
 * different purposes, and folding the synthetic entries in here would
 * assign them real field-presence bits they were never meant to occupy.
 *
 * `decoderVersion` is read fresh from {@link getInstalledDecoderVersion}
 * rather than taken from `result`, because `DecodeResult` carries no version
 * field at all — see decoder-version.ts.
 */
export function buildIndexInput(
  messageId: number,
  result: AcarsDecodeResult,
): DecodedMessageForIndex {
  return {
    messageId,
    decoderName: result.decoder.name,
    decoderVersion: getInstalledDecoderVersion(),
    description: result.formatted.description,
    fieldLabels: result.formatted.items.map((item) => item.label),
  };
}
