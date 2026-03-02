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

import type { AcarsMsg } from "@acarshub/types";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plane } from "../../types";
import { MessageGroup } from "../MessageGroup";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../store/useAppStore", () => ({
  useAppStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      adsbAircraft: null,
    }),
  ),
}));

vi.mock("../../components/MessageCard", () => ({
  MessageCard: ({ message }: { message: AcarsMsg }) => (
    <div data-testid="message-card" data-uid={message.uid}>
      {message.text ?? "(no text)"}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(uid: string, text = `Message ${uid}`): AcarsMsg {
  return {
    uid,
    station_id: "TEST",
    toaddr: "",
    fromaddr: "",
    depa: "",
    dsta: "",
    eta: "",
    gtout: "",
    gtin: "",
    wloff: "",
    wlin: "",
    lat: undefined,
    lon: undefined,
    alt: undefined,
    text,
    tail: "N12345",
    flight: "UAL001",
    icao: 0xabc123,
    freq: 131.55,
    ack: "",
    mode: "2",
    label: "H1",
    block_id: "1",
    msgno: "M01A",
    is_response: 0,
    is_onground: 0,
    error: 0,
    libacars: undefined,
    level: -10,
    timestamp: 1704067200,
    message_type: "ACARS",
    icao_hex: "ABC123",
    matched: false,
    matched_text: [],
    duplicates: "",
    msgno_parts: "",
    airline: undefined,
    iata_flight: undefined,
    icao_flight: undefined,
    flight_number: undefined,
  } as unknown as AcarsMsg;
}

function makePlane(messages: AcarsMsg[]): Plane {
  return {
    identifiers: ["N12345"],
    has_alerts: false,
    num_alerts: 0,
    messages,
    lastUpdated: Date.now() / 1000,
  };
}

function renderGroup(
  plane: Plane,
  props: Partial<React.ComponentProps<typeof MessageGroup>> = {},
) {
  return render(
    <MemoryRouter>
      <MessageGroup plane={plane} {...props} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MessageGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("single message", () => {
    it("renders the message card", () => {
      const plane = makePlane([makeMsg("uid-1", "Hello ACARS")]);
      renderGroup(plane);
      expect(screen.getByTestId("message-card")).toBeInTheDocument();
      expect(screen.getByText("Hello ACARS")).toBeInTheDocument();
    });

    it("does not render tab navigation for a single message", () => {
      const plane = makePlane([makeMsg("uid-1")]);
      renderGroup(plane);
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Previous message"),
      ).not.toBeInTheDocument();
    });
  });

  describe("multiple messages — tab navigation", () => {
    it("renders tab buttons for each message", () => {
      const plane = makePlane([
        makeMsg("uid-1"),
        makeMsg("uid-2"),
        makeMsg("uid-3"),
      ]);
      renderGroup(plane);
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(3);
    });

    it("shows the first message by default", () => {
      const msgs = [makeMsg("uid-1", "First"), makeMsg("uid-2", "Second")];
      const plane = makePlane(msgs);
      renderGroup(plane);
      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-1",
      );
    });

    it("regression: clicking a tab changes the displayed message", async () => {
      // This test reproduces the bug where clicking a tab in controlled mode
      // called onActiveIndexChange (a ref mutation) but did NOT trigger a
      // re-render, so the displayed message never changed.
      //
      // The fix: MessageGroup always uses internal state for display; the
      // activeIndex prop is only used as the initial state value.
      const user = userEvent.setup();
      const msgs = [
        makeMsg("uid-1", "First"),
        makeMsg("uid-2", "Second"),
        makeMsg("uid-3", "Third"),
      ];
      const plane = makePlane(msgs);

      // Simulate the virtualizer controlled mode: pass activeIndex + callback
      const onActiveIndexChange = vi.fn();
      renderGroup(plane, { activeIndex: 0, onActiveIndexChange });

      // Initially showing first message
      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-1",
      );

      // Click the second tab
      const tabs = screen.getAllByRole("tab");
      await user.click(tabs[1]);

      // The displayed message must switch immediately — this was the bug
      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-2",
      );

      // The parent callback must also have been called (for state persistence)
      expect(onActiveIndexChange).toHaveBeenCalledWith(1);
    });

    it("regression: clicking a tab changes the displayed message in uncontrolled mode", async () => {
      const user = userEvent.setup();
      const msgs = [makeMsg("uid-1", "First"), makeMsg("uid-2", "Second")];
      const plane = makePlane(msgs);

      renderGroup(plane); // no activeIndex / onActiveIndexChange

      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-1",
      );

      const tabs = screen.getAllByRole("tab");
      await user.click(tabs[1]);

      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-2",
      );
    });

    it("marks the active tab with aria-selected=true", async () => {
      const user = userEvent.setup();
      const msgs = [makeMsg("uid-1"), makeMsg("uid-2")];
      const plane = makePlane(msgs);
      renderGroup(plane);

      const [tab1, tab2] = screen.getAllByRole("tab");
      expect(tab1).toHaveAttribute("aria-selected", "true");
      expect(tab2).toHaveAttribute("aria-selected", "false");

      await user.click(tab2);

      expect(tab1).toHaveAttribute("aria-selected", "false");
      expect(tab2).toHaveAttribute("aria-selected", "true");
    });

    it("initialises from the activeIndex prop on mount", () => {
      // Simulates a virtualizer remount restoring saved tab state
      const msgs = [
        makeMsg("uid-1", "First"),
        makeMsg("uid-2", "Second"),
        makeMsg("uid-3", "Third"),
      ];
      const plane = makePlane(msgs);

      renderGroup(plane, { activeIndex: 2, onActiveIndexChange: vi.fn() });

      // Should start on the third message, not the first
      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-3",
      );
    });

    it("navigates with the previous arrow button", async () => {
      const user = userEvent.setup();
      const msgs = [makeMsg("uid-1", "First"), makeMsg("uid-2", "Second")];
      const plane = makePlane(msgs);
      renderGroup(plane, { activeIndex: 1, onActiveIndexChange: vi.fn() });

      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-2",
      );

      await user.click(screen.getByLabelText("Previous message"));

      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-1",
      );
    });

    it("navigates with the next arrow button", async () => {
      const user = userEvent.setup();
      const msgs = [makeMsg("uid-1", "First"), makeMsg("uid-2", "Second")];
      const plane = makePlane(msgs);
      renderGroup(plane);

      await user.click(screen.getByLabelText("Next message"));

      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-2",
      );
    });

    it("wraps around from the last tab to the first with the next button", async () => {
      const user = userEvent.setup();
      const msgs = [makeMsg("uid-1"), makeMsg("uid-2")];
      const plane = makePlane(msgs);
      renderGroup(plane, { activeIndex: 1, onActiveIndexChange: vi.fn() });

      await user.click(screen.getByLabelText("Next message"));

      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-1",
      );
    });

    it("wraps around from the first tab to the last with the previous button", async () => {
      const user = userEvent.setup();
      const msgs = [makeMsg("uid-1"), makeMsg("uid-2"), makeMsg("uid-3")];
      const plane = makePlane(msgs);
      renderGroup(plane); // starts at index 0

      await user.click(screen.getByLabelText("Previous message"));

      expect(screen.getByTestId("message-card")).toHaveAttribute(
        "data-uid",
        "uid-3",
      );
    });

    it("displays the correct message counter text", async () => {
      const user = userEvent.setup();
      const msgs = [makeMsg("uid-1"), makeMsg("uid-2"), makeMsg("uid-3")];
      const plane = makePlane(msgs);
      renderGroup(plane);

      expect(screen.getByText("Message 1/3")).toBeInTheDocument();

      await user.click(screen.getAllByRole("tab")[2]);

      expect(screen.getByText("Message 3/3")).toBeInTheDocument();
    });
  });

  describe("alert styling", () => {
    it("applies alert class when plane has alerts", () => {
      const plane: Plane = {
        ...makePlane([makeMsg("uid-1")]),
        has_alerts: true,
        num_alerts: 2,
      };
      const { container } = renderGroup(plane);
      expect(
        container.querySelector(".message-group--alert"),
      ).toBeInTheDocument();
    });

    it("does not apply alert class when plane has no alerts", () => {
      const plane = makePlane([makeMsg("uid-1")]);
      const { container } = renderGroup(plane);
      expect(
        container.querySelector(".message-group--alert"),
      ).not.toBeInTheDocument();
    });
  });
});
