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

import type {
  AcarsMsg,
  MessageGroup as MessageGroupType,
} from "@acarshub/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store/useAppStore";
import { AircraftMessagesModal } from "../AircraftMessagesModal";

// Mock the heavy MessageGroup child — its internals are tested separately.
// We only want to verify the modal wires the messageGroup prop through.
vi.mock("../../MessageGroup", () => ({
  MessageGroup: ({ plane }: { plane: MessageGroupType }) => (
    <div data-testid="message-group-mock">
      group:{plane.identifiers.join(",")}
    </div>
  ),
}));

function makeMsg(uid: string): AcarsMsg {
  return {
    uid,
    timestamp: 1_700_000_000 + Number(uid),
    station_id: "test-station",
    message_type: "ACARS",
  };
}

function makeGroup(identifiers: string[], msgUids: string[]): MessageGroupType {
  return {
    identifiers,
    has_alerts: false,
    num_alerts: 0,
    messages: msgUids.map(makeMsg),
    lastUpdated: 1_700_000_000,
  };
}

describe("AircraftMessagesModal", () => {
  let markMessagesAsRead: ReturnType<typeof vi.fn<(uids: string[]) => void>>;

  beforeEach(() => {
    markMessagesAsRead = vi.fn<(uids: string[]) => void>();
    useAppStore.setState({ markMessagesAsRead });
  });

  afterEach(() => {
    // Restore body overflow side-effect between tests
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  it("renders nothing when messageGroup is null", () => {
    const { container } = render(
      <AircraftMessagesModal messageGroup={null} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders modal with first non-empty identifier in the title", () => {
    const group = makeGroup(["UAL123", "ABC123"], ["1"]);
    render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", { name: /messages for UAL123/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/messages for UAL123/i)).toBeInTheDocument();
  });

  it("falls back to 'Unknown' when all identifiers are empty strings", () => {
    const group = makeGroup(["", ""], ["1"]);
    render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

    expect(screen.getByText(/messages for Unknown/i)).toBeInTheDocument();
  });

  it("renders the MessageGroup child with the passed group", () => {
    const group = makeGroup(["UAL123"], ["1", "2"]);
    render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

    expect(screen.getByTestId("message-group-mock")).toHaveTextContent(
      "group:UAL123",
    );
  });

  describe("Mark-as-read behaviour", () => {
    it("marks all messages in the group as read on mount", () => {
      const group = makeGroup(["UAL123"], ["1", "2", "3"]);
      render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

      expect(markMessagesAsRead).toHaveBeenCalledTimes(1);
      expect(markMessagesAsRead).toHaveBeenCalledWith(["1", "2", "3"]);
    });

    it("does not call markMessagesAsRead when the group has no messages", () => {
      const group = makeGroup(["UAL123"], []);
      render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

      expect(markMessagesAsRead).not.toHaveBeenCalled();
    });

    it("does not re-mark on re-render with the same group identifiers", () => {
      const group = makeGroup(["UAL123"], ["1"]);
      const { rerender } = render(
        <AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />,
      );

      expect(markMessagesAsRead).toHaveBeenCalledTimes(1);

      // Same identifiers, different message array (e.g. new msg arrived).
      // Component dedups by identifiers.join(",") so should NOT mark again.
      const updated = makeGroup(["UAL123"], ["1", "2"]);
      rerender(
        <AircraftMessagesModal messageGroup={updated} onClose={vi.fn()} />,
      );

      expect(markMessagesAsRead).toHaveBeenCalledTimes(1);
    });

    it("marks a NEW group as read when the modal switches aircraft without unmounting", () => {
      const group1 = makeGroup(["UAL123"], ["1"]);
      const { rerender } = render(
        <AircraftMessagesModal messageGroup={group1} onClose={vi.fn()} />,
      );

      expect(markMessagesAsRead).toHaveBeenCalledWith(["1"]);

      const group2 = makeGroup(["DAL456"], ["10", "20"]);
      rerender(
        <AircraftMessagesModal messageGroup={group2} onClose={vi.fn()} />,
      );

      expect(markMessagesAsRead).toHaveBeenCalledTimes(2);
      expect(markMessagesAsRead).toHaveBeenLastCalledWith(["10", "20"]);
    });
  });

  describe("Close interactions", () => {
    it("invokes onClose when the close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const group = makeGroup(["UAL123"], ["1"]);
      render(<AircraftMessagesModal messageGroup={group} onClose={onClose} />);

      await user.click(screen.getByRole("button", { name: /close messages/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("invokes onClose when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const group = makeGroup(["UAL123"], ["1"]);
      render(<AircraftMessagesModal messageGroup={group} onClose={onClose} />);

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("invokes onClose when the backdrop is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const group = makeGroup(["UAL123"], ["1"]);
      const { container } = render(
        <AircraftMessagesModal messageGroup={group} onClose={onClose} />,
      );

      const backdrop = container.querySelector(
        ".aircraft-messages-modal__backdrop",
      ) as HTMLElement;
      expect(backdrop).not.toBeNull();
      await user.click(backdrop);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT invoke onClose when the modal body (inside backdrop) is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const group = makeGroup(["UAL123"], ["1"]);
      render(<AircraftMessagesModal messageGroup={group} onClose={onClose} />);

      // Click on the dialog itself — currentTarget !== target so handler bails
      await user.click(screen.getByRole("dialog"));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Side effects: body scroll lock", () => {
    it("disables body scroll while the modal is open", () => {
      const group = makeGroup(["UAL123"], ["1"]);
      render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores body scroll when messageGroup becomes null", () => {
      const group = makeGroup(["UAL123"], ["1"]);
      const { rerender } = render(
        <AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />,
      );

      expect(document.body.style.overflow).toBe("hidden");

      rerender(<AircraftMessagesModal messageGroup={null} onClose={vi.fn()} />);

      expect(document.body.style.overflow).toBe("");
    });

    it("restores body scroll on unmount", () => {
      const group = makeGroup(["UAL123"], ["1"]);
      const { unmount } = render(
        <AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />,
      );

      expect(document.body.style.overflow).toBe("hidden");
      unmount();
      expect(document.body.style.overflow).toBe("");
    });
  });

  describe("Accessibility", () => {
    it("renders with role=dialog and aria-modal=true", () => {
      const group = makeGroup(["UAL123"], ["1"]);
      render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute(
        "aria-labelledby",
        "aircraft-messages-modal-title",
      );
    });

    it("labels the close button for screen readers", () => {
      const group = makeGroup(["UAL123"], ["1"]);
      render(<AircraftMessagesModal messageGroup={group} onClose={vi.fn()} />);

      const close = screen.getByRole("button", { name: /close messages/i });
      expect(close).toHaveAttribute("aria-label", "Close messages");
    });
  });
});
