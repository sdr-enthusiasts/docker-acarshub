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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetNavActionSlotForTesting,
  getNavActionSlot,
  registerNavActionSlot,
  subscribeToNavActionSlot,
} from "../navActionSlot";

afterEach(() => {
  _resetNavActionSlotForTesting();
});

describe("navActionSlot registry", () => {
  it("returns null before any slot is registered", () => {
    expect(getNavActionSlot()).toBeNull();
  });

  it("returns the registered element", () => {
    const el = document.createElement("div");
    registerNavActionSlot(el);
    expect(getNavActionSlot()).toBe(el);
  });

  it("returns null again after deregistration", () => {
    const el = document.createElement("div");
    registerNavActionSlot(el);
    registerNavActionSlot(null);
    expect(getNavActionSlot()).toBeNull();
  });

  it("replaces the previous slot when a new one is registered", () => {
    // Happens on a mobile -> desktop -> mobile transition, where the nav
    // unmounts and remounts its slot as a brand new element.
    const first = document.createElement("div");
    const second = document.createElement("div");
    registerNavActionSlot(first);
    registerNavActionSlot(second);
    expect(getNavActionSlot()).toBe(second);
  });

  it("notifies subscribers synchronously with the new slot", () => {
    // Synchronous notification is what lets a page re-render in the same
    // commit as the nav swapping layouts, so the action never disappears for
    // a frame.
    const cb = vi.fn();
    subscribeToNavActionSlot(cb);

    const el = document.createElement("div");
    registerNavActionSlot(el);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(el);
  });

  it("notifies subscribers with null on deregistration", () => {
    const cb = vi.fn();
    subscribeToNavActionSlot(cb);

    registerNavActionSlot(document.createElement("div"));
    registerNavActionSlot(null);

    expect(cb).toHaveBeenLastCalledWith(null);
  });

  it("does not invoke the callback at subscription time", () => {
    // Documented contract, mirroring subscribeToScrollContainer: callers read
    // the initial value with getNavActionSlot() instead.
    registerNavActionSlot(document.createElement("div"));

    const cb = vi.fn();
    subscribeToNavActionSlot(cb);

    expect(cb).not.toHaveBeenCalled();
  });

  it("notifies every subscriber", () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeToNavActionSlot(first);
    subscribeToNavActionSlot(second);

    const el = document.createElement("div");
    registerNavActionSlot(el);

    expect(first).toHaveBeenCalledWith(el);
    expect(second).toHaveBeenCalledWith(el);
  });

  it("stops notifying after unsubscribe", () => {
    // A leak here would keep unmounted pages re-rendering on every nav layout
    // change for the lifetime of the tab.
    const cb = vi.fn();
    const unsubscribe = subscribeToNavActionSlot(cb);
    unsubscribe();

    registerNavActionSlot(document.createElement("div"));

    expect(cb).not.toHaveBeenCalled();
  });

  it("unsubscribing one subscriber leaves the others attached", () => {
    const kept = vi.fn();
    const dropped = vi.fn();
    subscribeToNavActionSlot(kept);
    const unsubscribe = subscribeToNavActionSlot(dropped);
    unsubscribe();

    registerNavActionSlot(document.createElement("div"));

    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });
});
