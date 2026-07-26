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

import { create } from "zustand";

/**
 * Toast variants. Drives styling (colors), title default, and ARIA semantics.
 *
 * - `alert`   — alert-term match (red, "Alert Matched", role=alert assertive)
 * - `success` — operation succeeded (green, role=status polite)
 * - `error`   — operation failed (red, role=alert assertive)
 * - `info`    — neutral notice (blue, role=status polite)
 */
export type ToastVariant = "alert" | "success" | "error" | "info";

export interface ToastEntry {
  /** Stable ID for keyed rendering and dismissal */
  id: string;
  /** Variant — determines colors, title default, and ARIA semantics */
  variant: ToastVariant;
  /** Optional explicit title; falls back to variant default */
  title?: string;
  /** Body text */
  message: string;
  /**
   * Alert-only: matched alert terms shown in monospace.  When set, `message`
   * is ignored by the renderer in favour of the term list.
   */
  terms?: string[];
  /** Auto-dismiss duration in ms (0 = persist until manually dismissed) */
  duration: number;
  /** Timestamp the toast was created (for ordering / dedup heuristics) */
  createdAt: number;
}

/**
 * Input shape for `showToast`.  All fields except `variant` and `message`
 * are optional and have sensible defaults.
 */
export interface ShowToastInput {
  variant: ToastVariant;
  message?: string;
  title?: string;
  terms?: string[];
  duration?: number;
}

interface ToastState {
  toasts: ToastEntry[];
  /**
   * Push a new toast onto the queue.  Returns the generated id so callers
   * can `dismissToast(id)` early if needed.
   */
  showToast: (input: ShowToastInput) => string;
  /** Remove a toast by id (no-op if not found) */
  dismissToast: (id: string) => void;
  /** Remove every toast — used by tests and on logout/reset paths */
  clearAllToasts: () => void;
}

const DEFAULT_DURATION_MS = 5000;

let toastCounter = 0;
function generateToastId(): string {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: ({ variant, message, title, terms, duration }) => {
    const id = generateToastId();
    const entry: ToastEntry = {
      id,
      variant,
      title,
      message: message ?? "",
      terms,
      duration: duration ?? DEFAULT_DURATION_MS,
      createdAt: Date.now(),
    };
    set((state) => ({ toasts: [...state.toasts, entry] }));
    return id;
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  clearAllToasts: () => {
    set({ toasts: [] });
  },
}));
