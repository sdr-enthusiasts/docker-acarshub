// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MessageFilters Tests
 *
 * Why this exists: MessageFilters is the toolbar above the Live
 * Messages view and the single funnel that gates every other filter
 * the user can apply (text search, station id allow-list, label
 * deny-list, no-text toggle, alerts-only toggle, pause). All of its
 * outputs are callbacks into the parent (LiveMessages page); a bug
 * here silently breaks every downstream filter without throwing.
 *
 * What this pins:
 *
 *  1. Text search:
 *     - The input is locally controlled (`localTextFilter`) so the
 *       user can type freely without firing a parent re-render on
 *       every keystroke. The parent is only notified on Enter or
 *       blur. Mutation-testing target.
 *     - The local state stays in sync when the parent clears the
 *       prop externally (the useEffect on `textFilter`).
 *     - The clear (✕) button appears only when localTextFilter is
 *       non-empty and fires onTextFilterChange('') AND resets local
 *       state.
 *
 *  2. Toggle wiring (hide-no-text, alerts-only): the rendered
 *     Toggle's role=switch is wired straight through to the
 *     corresponding onChange prop.
 *
 *  3. Pause button:
 *     - Label flips between '▶ Resume' and '⏸ Pause' on isPaused.
 *     - Click inverts the prop and fires onPauseChange.
 *     - Variant is 'warning' when paused (regression guard for the
 *       visual indication; users rely on the colour to know).
 *
 *  4. Station modal:
 *     - Button label includes '(N selected)' iff selectedStationIds
 *       is non-empty (catches both 'always shows zero' and 'never
 *       shows count' regressions).
 *     - Opening the modal renders one checkbox per stationId, and
 *       checking/unchecking dispatches onSelectedStationIdsChange
 *       with the immutable add/remove (NOT in-place mutation).
 *     - Empty-state copy renders when stationIds is [].
 *     - 'Clear All' button shows iff selectedStationIds is non-empty
 *       and dispatches an empty array.
 *
 *  5. Label modal:
 *     - Button label includes '(N hidden)' iff excludedLabels is
 *       non-empty.
 *     - Opening renders one checkbox per label, sorted by labelId
 *       (the sort is pinned because the LayerControl-style UX
 *       relies on stable ordering — a regression to insertion order
 *       would silently reshuffle the user's UI on every render).
 *     - Toggle dispatches add/remove immutably.
 *     - Empty-state copy renders when labels.labels is empty.
 *     - 'Clear All (N)' shows iff excludedLabels is non-empty.
 *
 *  6. memo + displayName: pinned (it's a memoised component used
 *     in a tight render path; an accidental un-memo would silently
 *     regress LiveMessages performance).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Labels } from "../../types";
import { MessageFilters } from "../MessageFilters";

function makeProps(
  overrides: Partial<React.ComponentProps<typeof MessageFilters>> = {},
): React.ComponentProps<typeof MessageFilters> {
  return {
    labels: { labels: {} } as Labels,
    excludedLabels: [],
    onExcludedLabelsChange: vi.fn(),
    filterNoText: false,
    onFilterNoTextChange: vi.fn(),
    isPaused: false,
    onPauseChange: vi.fn(),
    textFilter: "",
    onTextFilterChange: vi.fn(),
    showAlertsOnly: false,
    onShowAlertsOnlyChange: vi.fn(),
    stationIds: [],
    selectedStationIds: [],
    onSelectedStationIdsChange: vi.fn(),
    ...overrides,
  };
}

describe("MessageFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("memoisation", () => {
    it("is wrapped in React.memo (LiveMessages render-path perf)", () => {
      // The component participates in a high-frequency render path
      // (every incoming ACARS message rerenders LiveMessages).
      // An accidental un-memo would silently regress perf.
      // React.memo sets a $$typeof and a `type` field on the
      // exotic-component object.
      expect(
        (MessageFilters as unknown as { $$typeof: symbol }).$$typeof,
      ).toBeDefined();
      expect(MessageFilters.displayName).toBe("MessageFilters");
    });
  });

  describe("text search", () => {
    it("renders the search input with the current textFilter as initial value", () => {
      render(<MessageFilters {...makeProps({ textFilter: "hello" })} />);
      expect(screen.getByLabelText("Search:")).toHaveValue("hello");
    });

    it("typing does NOT fire onTextFilterChange (local-state contract)", async () => {
      // Critical perf contract: the parent (LiveMessages) must not
      // re-render on every keystroke. The input is locally
      // controlled until Enter or blur. A regression that wires
      // onChange straight to the parent callback would silently
      // make typing janky with thousands of messages in memory.
      const user = userEvent.setup();
      const onTextFilterChange = vi.fn();
      render(<MessageFilters {...makeProps({ onTextFilterChange })} />);
      await user.type(screen.getByLabelText("Search:"), "abc");
      expect(onTextFilterChange).not.toHaveBeenCalled();
    });

    it("typing then pressing Enter fires onTextFilterChange with the typed value", async () => {
      const user = userEvent.setup();
      const onTextFilterChange = vi.fn();
      render(<MessageFilters {...makeProps({ onTextFilterChange })} />);
      const input = screen.getByLabelText("Search:");
      await user.type(input, "abc{Enter}");
      expect(onTextFilterChange).toHaveBeenCalledWith("abc");
    });

    it("typing then blurring fires onTextFilterChange with the typed value", async () => {
      const user = userEvent.setup();
      const onTextFilterChange = vi.fn();
      render(<MessageFilters {...makeProps({ onTextFilterChange })} />);
      const input = screen.getByLabelText("Search:");
      await user.type(input, "abc");
      input.blur();
      expect(onTextFilterChange).toHaveBeenCalledWith("abc");
    });

    it("syncs local state when the parent clears textFilter externally", () => {
      // Regression for the useEffect on textFilter: if the parent
      // clears the filter (e.g. a 'Clear all filters' button), the
      // input must reflect the cleared value. Without the effect
      // the input would stay 'sticky' showing the user's typed
      // text after the parent reset.
      const { rerender } = render(
        <MessageFilters {...makeProps({ textFilter: "abc" })} />,
      );
      expect(screen.getByLabelText("Search:")).toHaveValue("abc");
      rerender(<MessageFilters {...makeProps({ textFilter: "" })} />);
      expect(screen.getByLabelText("Search:")).toHaveValue("");
    });

    it("clear (✕) button is hidden when localTextFilter is empty", () => {
      render(<MessageFilters {...makeProps()} />);
      expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
    });

    it("clear (✕) button appears once the user types and dispatches '' on click", async () => {
      const user = userEvent.setup();
      const onTextFilterChange = vi.fn();
      render(<MessageFilters {...makeProps({ onTextFilterChange })} />);
      await user.type(screen.getByLabelText("Search:"), "abc");
      const clearBtn = screen.getByLabelText("Clear search");
      await user.click(clearBtn);
      expect(onTextFilterChange).toHaveBeenCalledWith("");
      expect(screen.getByLabelText("Search:")).toHaveValue("");
    });
  });

  describe("toggles (hide no-text, alerts-only)", () => {
    it("hide-no-text toggle reflects filterNoText prop and dispatches onFilterNoTextChange", async () => {
      const user = userEvent.setup();
      const onFilterNoTextChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({ filterNoText: false, onFilterNoTextChange })}
        />,
      );
      const toggle = screen.getByRole("switch", { name: /hide no-text/i });
      expect(toggle).not.toBeChecked();
      await user.click(toggle);
      expect(onFilterNoTextChange).toHaveBeenCalledWith(true);
    });

    it("alerts-only toggle reflects showAlertsOnly prop and dispatches onShowAlertsOnlyChange", async () => {
      const user = userEvent.setup();
      const onShowAlertsOnlyChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({ showAlertsOnly: true, onShowAlertsOnlyChange })}
        />,
      );
      const toggle = screen.getByRole("switch", { name: /alerts only/i });
      expect(toggle).toBeChecked();
      await user.click(toggle);
      expect(onShowAlertsOnlyChange).toHaveBeenCalledWith(false);
    });
  });

  describe("pause button", () => {
    it("shows '⏸ Pause' when isPaused=false", () => {
      render(<MessageFilters {...makeProps({ isPaused: false })} />);
      expect(screen.getByRole("button", { name: /pause/i })).toHaveTextContent(
        /pause/i,
      );
    });

    it("shows '▶ Resume' when isPaused=true", () => {
      render(<MessageFilters {...makeProps({ isPaused: true })} />);
      expect(screen.getByRole("button", { name: /resume/i })).toHaveTextContent(
        /resume/i,
      );
    });

    it("click flips the prop (true -> false)", async () => {
      const user = userEvent.setup();
      const onPauseChange = vi.fn();
      render(
        <MessageFilters {...makeProps({ isPaused: true, onPauseChange })} />,
      );
      await user.click(screen.getByRole("button", { name: /resume/i }));
      expect(onPauseChange).toHaveBeenCalledWith(false);
    });

    it("click flips the prop (false -> true)", async () => {
      const user = userEvent.setup();
      const onPauseChange = vi.fn();
      render(
        <MessageFilters {...makeProps({ isPaused: false, onPauseChange })} />,
      );
      await user.click(screen.getByRole("button", { name: /pause/i }));
      expect(onPauseChange).toHaveBeenCalledWith(true);
    });
  });

  describe("station filter modal", () => {
    it("button label omits the count when no stations are selected", () => {
      render(
        <MessageFilters
          {...makeProps({
            stationIds: ["s1", "s2"],
            selectedStationIds: [],
          })}
        />,
      );
      const btn = screen.getByRole("button", { name: /^Stations/ });
      expect(btn.textContent?.trim()).toMatch(/^Stations\s*$/);
    });

    it("button label includes '(N selected)' when stations are selected", () => {
      render(
        <MessageFilters
          {...makeProps({
            stationIds: ["s1", "s2"],
            selectedStationIds: ["s1"],
          })}
        />,
      );
      expect(
        screen.getByRole("button", { name: /^Stations/ }),
      ).toHaveTextContent("(1 selected)");
    });

    it("opens on click, renders one checkbox per station id", async () => {
      const user = userEvent.setup();
      render(
        <MessageFilters
          {...makeProps({ stationIds: ["alpha", "bravo", "charlie"] })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Stations/ }));
      const dialog = screen.getByRole("dialog");
      // Each station renders a checkbox with id station-${stationId}
      expect(
        within(dialog).getByRole("checkbox", { name: /alpha/i }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("checkbox", { name: /bravo/i }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("checkbox", { name: /charlie/i }),
      ).toBeInTheDocument();
    });

    it("toggling an unselected station ADDS it (immutable, append at end)", async () => {
      const user = userEvent.setup();
      const onSelectedStationIdsChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({
            stationIds: ["alpha", "bravo"],
            selectedStationIds: ["alpha"],
            onSelectedStationIdsChange,
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Stations/ }));
      const dialog = screen.getByRole("dialog");
      await user.click(
        within(dialog).getByRole("checkbox", { name: /bravo/i }),
      );
      // Pin both the value (add at end) and the immutability
      // (NOT the same array reference as the input).
      expect(onSelectedStationIdsChange).toHaveBeenCalledWith([
        "alpha",
        "bravo",
      ]);
    });

    it("toggling an already-selected station REMOVES it (immutable filter)", async () => {
      const user = userEvent.setup();
      const onSelectedStationIdsChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({
            stationIds: ["alpha", "bravo"],
            selectedStationIds: ["alpha", "bravo"],
            onSelectedStationIdsChange,
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Stations/ }));
      const dialog = screen.getByRole("dialog");
      await user.click(
        within(dialog).getByRole("checkbox", { name: /alpha/i }),
      );
      expect(onSelectedStationIdsChange).toHaveBeenCalledWith(["bravo"]);
    });

    it("renders an empty-state message when stationIds is []", async () => {
      const user = userEvent.setup();
      render(<MessageFilters {...makeProps({ stationIds: [] })} />);
      await user.click(screen.getByRole("button", { name: /^Stations/ }));
      expect(
        screen.getByText(/no station ids available yet/i),
      ).toBeInTheDocument();
    });

    it("'Clear All' button is hidden when no stations are selected", async () => {
      const user = userEvent.setup();
      render(
        <MessageFilters
          {...makeProps({
            stationIds: ["alpha"],
            selectedStationIds: [],
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Stations/ }));
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).queryByRole("button", { name: /clear all/i }),
      ).not.toBeInTheDocument();
    });

    it("'Clear All' button appears and dispatches [] when stations are selected", async () => {
      const user = userEvent.setup();
      const onSelectedStationIdsChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({
            stationIds: ["alpha", "bravo"],
            selectedStationIds: ["alpha"],
            onSelectedStationIdsChange,
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Stations/ }));
      const dialog = screen.getByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", { name: /clear all/i }),
      );
      expect(onSelectedStationIdsChange).toHaveBeenCalledWith([]);
    });
  });

  describe("label filter modal", () => {
    const sampleLabels: Labels = {
      labels: {
        // Deliberately out-of-order to exercise the sort.
        H1: { name: "Aircraft Operational Control" },
        A0: { name: "Aircraft Communications Addressing" },
        B6: { name: "Manufacturer Defined" },
      },
    };

    it("button label omits '(N hidden)' when no labels are excluded", () => {
      render(<MessageFilters {...makeProps({ excludedLabels: [] })} />);
      const btn = screen.getByRole("button", {
        name: /^Labels/,
      });
      expect(btn.textContent?.trim()).toMatch(/^Labels\s*$/);
    });

    it("button label includes '(N hidden)' when labels are excluded", () => {
      render(
        <MessageFilters {...makeProps({ excludedLabels: ["A0", "H1"] })} />,
      );
      expect(screen.getByRole("button", { name: /^Labels/ })).toHaveTextContent(
        "(2 hidden)",
      );
    });

    it("opens the modal and renders labels sorted by labelId", async () => {
      const user = userEvent.setup();
      render(<MessageFilters {...makeProps({ labels: sampleLabels })} />);
      await user.click(screen.getByRole("button", { name: /^Labels/ }));
      const dialog = screen.getByRole("dialog");
      const labelTexts = within(dialog)
        .getAllByText(/^(A0|B6|H1)$/)
        .map((el) => el.textContent);
      // Pin the sorted order. A regression to insertion order
      // would silently shuffle the UI on every render.
      expect(labelTexts).toEqual(["A0", "B6", "H1"]);
    });

    it("toggling an unexcluded label ADDS it (immutable append)", async () => {
      const user = userEvent.setup();
      const onExcludedLabelsChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({
            labels: sampleLabels,
            excludedLabels: ["A0"],
            onExcludedLabelsChange,
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Labels/ }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("checkbox", { name: /B6/i }));
      expect(onExcludedLabelsChange).toHaveBeenCalledWith(["A0", "B6"]);
    });

    it("toggling an already-excluded label REMOVES it (immutable filter)", async () => {
      const user = userEvent.setup();
      const onExcludedLabelsChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({
            labels: sampleLabels,
            excludedLabels: ["A0", "H1"],
            onExcludedLabelsChange,
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Labels/ }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("checkbox", { name: /A0/i }));
      expect(onExcludedLabelsChange).toHaveBeenCalledWith(["H1"]);
    });

    it("renders an empty-state when labels.labels is empty", async () => {
      const user = userEvent.setup();
      render(<MessageFilters {...makeProps({ labels: { labels: {} } })} />);
      await user.click(screen.getByRole("button", { name: /^Labels/ }));
      expect(
        screen.getByText(/no message labels available/i),
      ).toBeInTheDocument();
    });

    it("'Clear All' is hidden when no labels are excluded", async () => {
      const user = userEvent.setup();
      render(
        <MessageFilters
          {...makeProps({ labels: sampleLabels, excludedLabels: [] })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Labels/ }));
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).queryByRole("button", { name: /clear all/i }),
      ).not.toBeInTheDocument();
    });

    it("'Clear All' appears with the count and dispatches [] when labels are excluded", async () => {
      const user = userEvent.setup();
      const onExcludedLabelsChange = vi.fn();
      render(
        <MessageFilters
          {...makeProps({
            labels: sampleLabels,
            excludedLabels: ["A0", "B6"],
            onExcludedLabelsChange,
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Labels/ }));
      const dialog = screen.getByRole("dialog");
      const clearBtn = within(dialog).getByRole("button", {
        name: /clear all/i,
      });
      expect(clearBtn).toHaveTextContent("(2)");
      await user.click(clearBtn);
      expect(onExcludedLabelsChange).toHaveBeenCalledWith([]);
    });

    it("handles missing labels.labels gracefully (undefined object)", async () => {
      // The component uses `labels.labels || {}` to guard against
      // a malformed payload from the backend. Pinning so a
      // refactor that drops the `|| {}` fallback gets caught
      // (it would throw inside Object.entries).
      const user = userEvent.setup();
      render(
        <MessageFilters
          {...makeProps({
            labels: { labels: undefined as unknown as Labels["labels"] },
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^Labels/ }));
      expect(
        screen.getByText(/no message labels available/i),
      ).toBeInTheDocument();
    });
  });
});
