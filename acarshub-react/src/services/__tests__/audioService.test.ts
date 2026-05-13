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

// ----------------------------------------------------------------------------
// audioService.ts — singleton wrapper around HTMLAudioElement for alert sounds.
//
// Covers:
//   1. Constructor reads STORAGE_KEY from localStorage; flips audioUnlocked
//      when it sees "true".
//   2. playAlertSound() volume clamping (0..100 -> 0..1).
//   3. Lazy Audio element creation + reuse.
//   4. Success path persists unlock to localStorage on first successful play.
//   5. Autoplay-block path translates NotAllowedError / NotSupportedError
//      into "AUTOPLAY_BLOCKED" without persisting unlock.
//   6. Non-autoplay errors rethrow without persisting unlock.
//   7. isAudioUnlocked() reflects current state.
//   8. reset() clears state, localStorage, and pauses + rewinds audio.
//
// We mock the global Audio constructor so tests control play() resolution.
// vi.resetModules() between tests re-runs the constructor against a fresh
// localStorage state.
// ----------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// FakeAudio — replaces global Audio for the lifetime of this test file.
//
// Each instance records the constructor src, exposes a mutable `play` mock,
// and tracks volume / pause / currentTime so we can assert side effects.
// ---------------------------------------------------------------------------

class FakeAudio {
  static instances: FakeAudio[] = [];
  static defaultPlay: () => Promise<void> = () => Promise.resolve();

  src: string;
  volume = 1;
  currentTime = 0;
  paused = true;
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  // Each instance gets its own play spy, defaulting to the class-level
  // factory.  Tests override via `audio.play = vi.fn().mockRejectedValueOnce(...)`.
  play = vi.fn(() => FakeAudio.defaultPlay());

  constructor(src?: string) {
    this.src = src ?? "";
    FakeAudio.instances.push(this);
  }

  static reset(): void {
    FakeAudio.instances = [];
    FakeAudio.defaultPlay = () => Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Mock the logger so spurious info/warn calls don't pollute test output.
// ---------------------------------------------------------------------------

vi.mock("../../utils/logger", () => ({
  uiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// alert.mp3 is imported with the ?url Vite suffix which Vitest doesn't
// understand without help.  Mock it to a stable path.
// ---------------------------------------------------------------------------

vi.mock("../../assets/sounds/alert.mp3?url", () => ({
  default: "/test/alert.mp3",
}));

// ---------------------------------------------------------------------------
// Install FakeAudio globally before any test imports the service.
// ---------------------------------------------------------------------------

const originalAudio = globalThis.Audio;
beforeEach(() => {
  FakeAudio.reset();
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  localStorage.clear();
});

afterEach(() => {
  globalThis.Audio = originalAudio;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Dynamic import so each test gets a fresh `audioService` singleton with a
// constructor that observes the current localStorage state.
// ---------------------------------------------------------------------------

type AudioModule = typeof import("../audioService");

async function loadFreshService(): Promise<AudioModule["audioService"]> {
  vi.resetModules();
  const mod = (await import("../audioService")) as AudioModule;
  return mod.audioService;
}

const STORAGE_KEY = "acarshub.audioUnlocked";

// ---------------------------------------------------------------------------
// Constructor — persisted unlock state
// ---------------------------------------------------------------------------

describe("AudioService constructor", () => {
  it("starts locked when localStorage is empty", async () => {
    const svc = await loadFreshService();
    expect(svc.isAudioUnlocked()).toBe(false);
  });

  it("reads persisted unlock state from localStorage on construction", async () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const svc = await loadFreshService();
    expect(svc.isAudioUnlocked()).toBe(true);
  });

  it("treats any non-'true' stored value as locked", async () => {
    // Defensive: only the literal string "true" should unlock.  This guards
    // against accidental coercion bugs (e.g. JSON.parse("1") === 1 truthy).
    for (const stored of ["false", "1", "yes", "", "TRUE"]) {
      localStorage.setItem(STORAGE_KEY, stored);
      const svc = await loadFreshService();
      expect(svc.isAudioUnlocked(), `stored="${stored}"`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// playAlertSound — happy path
// ---------------------------------------------------------------------------

describe("AudioService.playAlertSound — success path", () => {
  it("lazily creates an Audio element on first play", async () => {
    const svc = await loadFreshService();
    expect(FakeAudio.instances).toHaveLength(0);
    await svc.playAlertSound(50);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]?.src).toBe("/test/alert.mp3");
  });

  it("reuses the same Audio element across multiple plays", async () => {
    const svc = await loadFreshService();
    await svc.playAlertSound(50);
    await svc.playAlertSound(75);
    await svc.playAlertSound(25);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]?.play).toHaveBeenCalledTimes(3);
  });

  it("converts volume from 0..100 to 0..1 before assigning to Audio.volume", async () => {
    const svc = await loadFreshService();
    await svc.playAlertSound(50);
    expect(FakeAudio.instances[0]?.volume).toBeCloseTo(0.5, 5);
    await svc.playAlertSound(100);
    expect(FakeAudio.instances[0]?.volume).toBeCloseTo(1, 5);
    await svc.playAlertSound(0);
    expect(FakeAudio.instances[0]?.volume).toBe(0);
  });

  it("clamps volume below 0 to 0 and above 100 to 1", async () => {
    const svc = await loadFreshService();
    await svc.playAlertSound(-50);
    expect(FakeAudio.instances[0]?.volume).toBe(0);
    await svc.playAlertSound(250);
    expect(FakeAudio.instances[0]?.volume).toBe(1);
  });

  it("persists unlock to localStorage on first successful play", async () => {
    const svc = await loadFreshService();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await svc.playAlertSound(50);
    expect(svc.isAudioUnlocked()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("does not re-write localStorage on subsequent successful plays", async () => {
    const svc = await loadFreshService();
    await svc.playAlertSound(50);
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    await svc.playAlertSound(50);
    await svc.playAlertSound(50);
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// playAlertSound — autoplay block
// ---------------------------------------------------------------------------

describe("AudioService.playAlertSound — autoplay-block path", () => {
  function makeAutoplayError(
    name: "NotAllowedError" | "NotSupportedError",
  ): Error {
    const err = new Error("autoplay blocked");
    err.name = name;
    return err;
  }

  it("translates NotAllowedError into AUTOPLAY_BLOCKED", async () => {
    FakeAudio.defaultPlay = () =>
      Promise.reject(makeAutoplayError("NotAllowedError"));
    const svc = await loadFreshService();
    await expect(svc.playAlertSound(50)).rejects.toThrow("AUTOPLAY_BLOCKED");
  });

  it("translates NotSupportedError into AUTOPLAY_BLOCKED", async () => {
    FakeAudio.defaultPlay = () =>
      Promise.reject(makeAutoplayError("NotSupportedError"));
    const svc = await loadFreshService();
    await expect(svc.playAlertSound(50)).rejects.toThrow("AUTOPLAY_BLOCKED");
  });

  it("does not persist unlock when autoplay is blocked", async () => {
    FakeAudio.defaultPlay = () =>
      Promise.reject(makeAutoplayError("NotAllowedError"));
    const svc = await loadFreshService();
    await expect(svc.playAlertSound(50)).rejects.toThrow();
    expect(svc.isAudioUnlocked()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("allows recovery: once play() succeeds after an earlier block, unlock is persisted", async () => {
    // First call rejects with autoplay block (service creates Audio lazily here).
    FakeAudio.defaultPlay = () =>
      Promise.reject(makeAutoplayError("NotAllowedError"));
    const svc = await loadFreshService();
    await expect(svc.playAlertSound(50)).rejects.toThrow("AUTOPLAY_BLOCKED");
    expect(svc.isAudioUnlocked()).toBe(false);

    // Now flip the lazily-created instance's play to resolve.
    const audio = FakeAudio.instances[0];
    if (!audio) throw new Error("expected audio instance after first play");
    audio.play.mockResolvedValueOnce(undefined);
    await svc.playAlertSound(50);
    expect(svc.isAudioUnlocked()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// playAlertSound — non-autoplay errors
// ---------------------------------------------------------------------------

describe("AudioService.playAlertSound — generic-error path", () => {
  it("rethrows non-autoplay errors unchanged", async () => {
    const original = new Error("network failure");
    original.name = "AbortError";
    FakeAudio.defaultPlay = () => Promise.reject(original);
    const svc = await loadFreshService();
    await expect(svc.playAlertSound(50)).rejects.toBe(original);
  });

  it("does not persist unlock on a generic error", async () => {
    FakeAudio.defaultPlay = () => Promise.reject(new Error("decode failure"));
    const svc = await loadFreshService();
    await expect(svc.playAlertSound(50)).rejects.toThrow();
    expect(svc.isAudioUnlocked()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("handles non-Error rejection values (e.g. string)", async () => {
    FakeAudio.defaultPlay = () => Promise.reject("string rejection");
    const svc = await loadFreshService();
    // Rejection is forwarded as-is; the service can't infer NotAllowedError
    // from a non-Error value so this is a generic error path.
    await expect(svc.playAlertSound(50)).rejects.toBe("string rejection");
    expect(svc.isAudioUnlocked()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe("AudioService.reset", () => {
  it("clears the unlocked flag", async () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const svc = await loadFreshService();
    expect(svc.isAudioUnlocked()).toBe(true);
    svc.reset();
    expect(svc.isAudioUnlocked()).toBe(false);
  });

  it("removes the unlock entry from localStorage", async () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const svc = await loadFreshService();
    svc.reset();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("pauses and rewinds the audio element when one exists", async () => {
    const svc = await loadFreshService();
    await svc.playAlertSound(50);
    const audio = FakeAudio.instances[0];
    if (!audio) throw new Error("expected audio instance");
    audio.currentTime = 1.23;
    svc.reset();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(0);
  });

  it("is safe to call before any audio element exists", async () => {
    const svc = await loadFreshService();
    expect(() => {
      svc.reset();
    }).not.toThrow();
    expect(FakeAudio.instances).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Singleton identity
// ---------------------------------------------------------------------------

describe("audioService singleton export", () => {
  it("exports the same instance across imports within the same module graph", async () => {
    vi.resetModules();
    const a = (await import("../audioService")).audioService;
    const b = (await import("../audioService")).audioService;
    expect(a).toBe(b);
  });
});
