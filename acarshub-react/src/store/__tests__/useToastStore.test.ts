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

import { beforeEach, describe, expect, it } from "vitest";
import { useToastStore } from "../useToastStore";

describe("useToastStore", () => {
  beforeEach(() => {
    useToastStore.getState().clearAllToasts();
  });

  describe("showToast", () => {
    it("appends a new toast and returns its id", () => {
      const id = useToastStore.getState().showToast({
        variant: "success",
        message: "Logs copied to clipboard",
      });

      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].id).toBe(id);
      expect(toasts[0].variant).toBe("success");
      expect(toasts[0].message).toBe("Logs copied to clipboard");
    });

    it("applies the default 5000ms duration when none is provided", () => {
      useToastStore.getState().showToast({
        variant: "info",
        message: "Hello",
      });

      expect(useToastStore.getState().toasts[0].duration).toBe(5000);
    });

    it("respects an explicit duration including 0 (persist)", () => {
      useToastStore.getState().showToast({
        variant: "error",
        message: "Persistent",
        duration: 0,
      });

      expect(useToastStore.getState().toasts[0].duration).toBe(0);
    });

    it("preserves alert-variant terms[]", () => {
      useToastStore.getState().showToast({
        variant: "alert",
        terms: ["MAYDAY", "PAN-PAN"],
      });

      const toast = useToastStore.getState().toasts[0];
      expect(toast.variant).toBe("alert");
      expect(toast.terms).toEqual(["MAYDAY", "PAN-PAN"]);
    });

    it("generates unique ids for rapid successive calls", () => {
      const id1 = useToastStore.getState().showToast({
        variant: "success",
        message: "First",
      });
      const id2 = useToastStore.getState().showToast({
        variant: "success",
        message: "Second",
      });

      expect(id1).not.toBe(id2);
      expect(useToastStore.getState().toasts).toHaveLength(2);
    });

    it("queues toasts in insertion order (FIFO)", () => {
      useToastStore.getState().showToast({ variant: "info", message: "A" });
      useToastStore.getState().showToast({ variant: "info", message: "B" });
      useToastStore.getState().showToast({ variant: "info", message: "C" });

      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
        "A",
        "B",
        "C",
      ]);
    });
  });

  describe("dismissToast", () => {
    it("removes the toast with the given id", () => {
      const id1 = useToastStore.getState().showToast({
        variant: "info",
        message: "First",
      });
      const id2 = useToastStore.getState().showToast({
        variant: "info",
        message: "Second",
      });

      useToastStore.getState().dismissToast(id1);

      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].id).toBe(id2);
    });

    it("is a no-op when the id is unknown", () => {
      useToastStore.getState().showToast({
        variant: "info",
        message: "Only",
      });

      useToastStore.getState().dismissToast("does-not-exist");

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe("clearAllToasts", () => {
    it("removes every toast", () => {
      useToastStore.getState().showToast({ variant: "info", message: "A" });
      useToastStore.getState().showToast({ variant: "info", message: "B" });

      useToastStore.getState().clearAllToasts();

      expect(useToastStore.getState().toasts).toEqual([]);
    });
  });
});
