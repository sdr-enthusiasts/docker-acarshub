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

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  _resetNavActionSlotForTesting,
  registerNavActionSlot,
} from "../../utils/navActionSlot";
import { useNavActionSlot } from "../useNavActionSlot";

afterEach(() => {
  _resetNavActionSlotForTesting();
});

describe("useNavActionSlot", () => {
  it("returns null when no slot is registered", () => {
    const { result } = renderHook(() => useNavActionSlot());
    expect(result.current).toBeNull();
  });

  it("returns a slot that was registered before the hook mounted", () => {
    // The cold-load ordering: Navigation commits (and registers) before the
    // routed page mounts, so the very first snapshot must already see it.
    const el = document.createElement("div");
    registerNavActionSlot(el);

    const { result } = renderHook(() => useNavActionSlot());

    expect(result.current).toBe(el);
  });

  it("re-renders with the slot when it is registered after mount", () => {
    const { result } = renderHook(() => useNavActionSlot());
    expect(result.current).toBeNull();

    const el = document.createElement("div");
    act(() => registerNavActionSlot(el));

    expect(result.current).toBe(el);
  });

  it("returns null again when the slot is deregistered", () => {
    // Happens on the mobile -> desktop transition. Consumers rely on this to
    // stop portalling into a node that is no longer in the document.
    const el = document.createElement("div");
    registerNavActionSlot(el);
    const { result } = renderHook(() => useNavActionSlot());
    expect(result.current).toBe(el);

    act(() => registerNavActionSlot(null));

    expect(result.current).toBeNull();
  });

  it("tracks a slot element being swapped for a different one", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    registerNavActionSlot(first);

    const { result } = renderHook(() => useNavActionSlot());
    expect(result.current).toBe(first);

    act(() => registerNavActionSlot(second));

    expect(result.current).toBe(second);
  });

  it("unsubscribes on unmount so later registrations do not update it", () => {
    const { result, unmount } = renderHook(() => useNavActionSlot());
    unmount();

    // Must not throw (a live subscription would try to set state on an
    // unmounted component) and must not mutate the last-read value.
    act(() => registerNavActionSlot(document.createElement("div")));

    expect(result.current).toBeNull();
  });
});
