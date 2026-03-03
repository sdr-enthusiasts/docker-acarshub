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

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerScrollContainer } from "../../utils/scrollRegistry";
import { ScrollToTopFab } from "../ScrollToTopFab";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock scroll element with a controllable scrollTop and a stubbed
 * scrollTo so we can assert scroll-to-top calls.
 */
function makeScrollElement(initialScrollTop = 0): HTMLElement {
  const el = document.createElement("div");
  let _scrollTop = initialScrollTop;

  Object.defineProperty(el, "scrollTop", {
    get: () => _scrollTop,
    set: (v: number) => {
      _scrollTop = v;
    },
    configurable: true,
  });

  el.scrollTo = vi.fn((...args: unknown[]) => {
    const options = args[0];
    if (typeof options === "object" && options !== null && "top" in options) {
      _scrollTop = (options as ScrollToOptions).top ?? 0;
    } else if (typeof options === "number") {
      _scrollTop = options;
    }
  });

  el.addEventListener = vi.fn(el.addEventListener.bind(el));
  el.removeEventListener = vi.fn(el.removeEventListener.bind(el));

  return el;
}

/**
 * Fires a scroll event on an element and waits for React to process it.
 */
async function fireScrollEvent(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new Event("scroll"));
  });
}

/**
 * Renders the FAB inside a MemoryRouter so useLocation() is available.
 */
function renderFab(initialPath = "/live-messages") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={<ScrollToTopFab />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Configures window.matchMedia to report the given mobile breakpoint result.
 * mobile = true  → "(max-width: 767px)" matches  → FAB renders
 * mobile = false → query does not match           → FAB returns null
 */
function setMobileMediaQuery(mobile: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(max-width: 767px)" ? mobile : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/**
 * Convenience: query the FAB button regardless of its aria-hidden state.
 *
 * When the FAB is hidden (aria-hidden="true") JSDOM does not expose its
 * aria-label as an accessible name, so getByRole(..., { name }) fails even
 * with { hidden: true }.  getByTestId bypasses that limitation and lets us
 * assert DOM presence / class state without coupling to accessibility semantics
 * that are only valid when the button is actually visible.
 *
 * Use getByRole (without hidden:true) when you need to assert that the button
 * is accessible — i.e. after scrolling past the threshold so aria-hidden=false.
 */
function getFabByTestId() {
  return screen.getByTestId("scroll-to-top-fab");
}

function queryFabByTestId() {
  return screen.queryByTestId("scroll-to-top-fab");
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Default to mobile viewport so most tests get a rendered FAB.
  setMobileMediaQuery(true);
  // Start each test with a clean registry.
  registerScrollContainer(null);
});

afterEach(() => {
  registerScrollContainer(null);
});

// ---------------------------------------------------------------------------
// Rendering — mobile gating
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — mobile gating", () => {
  it("renders the button on mobile viewports", () => {
    setMobileMediaQuery(true);
    renderFab("/live-messages");

    expect(getFabByTestId()).toBeInTheDocument();
  });

  it("renders nothing on desktop viewports", () => {
    setMobileMediaQuery(false);
    renderFab("/live-messages");

    expect(queryFabByTestId()).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Rendering — route exclusion
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — route exclusion", () => {
  it("renders nothing on the /adsb (Map) route", () => {
    setMobileMediaQuery(true);
    renderFab("/adsb");

    expect(queryFabByTestId()).not.toBeInTheDocument();
  });

  it("renders on /live-messages", () => {
    renderFab("/live-messages");
    expect(getFabByTestId()).toBeInTheDocument();
  });

  it("renders on /alerts", () => {
    renderFab("/alerts");
    expect(getFabByTestId()).toBeInTheDocument();
  });

  it("renders on /search", () => {
    renderFab("/search");
    expect(getFabByTestId()).toBeInTheDocument();
  });

  it("renders on /status", () => {
    renderFab("/status");
    expect(getFabByTestId()).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Visibility — starts hidden
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — initial visibility", () => {
  it("is initially hidden (no --visible class)", () => {
    renderFab("/live-messages");

    // Use getByTestId: button is aria-hidden=true so getByRole won't find it.
    const btn = getFabByTestId();
    expect(btn).not.toHaveClass("scroll-to-top-fab--visible");
  });

  it("has aria-hidden=true when not visible", () => {
    renderFab("/live-messages");

    const btn = getFabByTestId();
    expect(btn).toHaveAttribute("aria-hidden", "true");
  });

  it("has tabIndex=-1 when not visible", () => {
    renderFab("/live-messages");

    const btn = getFabByTestId();
    expect(btn).toHaveAttribute("tabindex", "-1");
  });
});

// ---------------------------------------------------------------------------
// Visibility — scroll threshold
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — scroll threshold", () => {
  it("becomes visible after scroll exceeds threshold", async () => {
    const scrollEl = makeScrollElement(0);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    // Simulate scrolling past 150 px threshold
    Object.defineProperty(scrollEl, "scrollTop", {
      get: () => 200,
      configurable: true,
    });
    await fireScrollEvent(scrollEl);

    // Button is now accessible (aria-hidden=false) — use getByRole.
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn).toHaveClass("scroll-to-top-fab--visible");
  });

  it("hides again when user scrolls back above threshold", async () => {
    const scrollEl = makeScrollElement(200);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    // First make it visible
    await fireScrollEvent(scrollEl);

    // Scroll back to top
    Object.defineProperty(scrollEl, "scrollTop", {
      get: () => 50,
      configurable: true,
    });
    await fireScrollEvent(scrollEl);

    // Button is hidden again (aria-hidden=true) — use getByTestId.
    const btn = getFabByTestId();
    expect(btn).not.toHaveClass("scroll-to-top-fab--visible");
  });

  it("remains hidden at exactly the threshold boundary (150 px, not strictly greater)", async () => {
    const scrollEl = makeScrollElement(150);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    await fireScrollEvent(scrollEl);

    // scrollTop > 150 is the condition — at exactly 150 it should still be hidden.
    // Button is hidden (aria-hidden=true) — use getByTestId.
    const btn = getFabByTestId();
    expect(btn).not.toHaveClass("scroll-to-top-fab--visible");
  });

  it("becomes visible at 151 px (one past the threshold)", async () => {
    const scrollEl = makeScrollElement(151);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    await fireScrollEvent(scrollEl);

    // Button is now accessible (aria-hidden=false) — use getByRole.
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn).toHaveClass("scroll-to-top-fab--visible");
  });
});

// ---------------------------------------------------------------------------
// Visibility — accessible attributes when visible
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — accessible attributes when visible", () => {
  it("sets aria-hidden=false when visible", async () => {
    const scrollEl = makeScrollElement(200);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    await fireScrollEvent(scrollEl);

    // Button is accessible (aria-hidden=false) — use getByRole.
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn).toHaveAttribute("aria-hidden", "false");
  });

  it("sets tabIndex=0 when visible", async () => {
    const scrollEl = makeScrollElement(200);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    await fireScrollEvent(scrollEl);

    // Button is accessible (aria-hidden=false) — use getByRole.
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn).toHaveAttribute("tabindex", "0");
  });
});

// ---------------------------------------------------------------------------
// Click handler
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — click handler", () => {
  it("calls scrollTo on the registered container when clicked", async () => {
    const user = userEvent.setup();
    const scrollEl = makeScrollElement(300);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    // Make it visible first
    await fireScrollEvent(scrollEl);

    // Button is accessible (aria-hidden=false) — use getByRole.
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    await user.click(btn);

    expect(scrollEl.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });

  it("calls scrollTo on .app-content when no custom container is registered", async () => {
    const user = userEvent.setup();

    const appContent = document.createElement("div");
    appContent.className = "app-content";
    appContent.scrollTo = vi.fn();
    let _appScrollTop = 300;
    Object.defineProperty(appContent, "scrollTop", {
      get: () => _appScrollTop,
      set: (v: number) => {
        _appScrollTop = v;
      },
      configurable: true,
    });
    appContent.addEventListener = vi.fn(
      appContent.addEventListener.bind(appContent),
    );
    document.body.appendChild(appContent);

    renderFab("/live-messages");

    // Trigger scroll on appContent to make FAB visible
    await act(async () => {
      appContent.dispatchEvent(new Event("scroll"));
    });

    // Button is now accessible (aria-hidden=false) — use getByRole.
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    await user.click(btn);

    expect(appContent.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });

    document.body.removeChild(appContent);
  });
});

// ---------------------------------------------------------------------------
// Registry subscription — re-attaches on container change
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — registry subscription", () => {
  it("re-attaches scroll listener when a new container is registered", async () => {
    const container1 = makeScrollElement(0);
    const container2 = makeScrollElement(0);

    registerScrollContainer(container1);
    renderFab("/live-messages");

    // Switch to a new container (simulates route change registering new page)
    await act(async () => {
      registerScrollContainer(container2);
    });

    // Scroll on container2 — should make FAB visible
    Object.defineProperty(container2, "scrollTop", {
      get: () => 200,
      configurable: true,
    });
    await fireScrollEvent(container2);

    // Button is now accessible (aria-hidden=false) — use getByRole.
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn).toHaveClass("scroll-to-top-fab--visible");
  });

  it("resets visibility when container is deregistered (route unmount)", async () => {
    const scrollEl = makeScrollElement(300);
    registerScrollContainer(scrollEl);
    renderFab("/live-messages");

    await fireScrollEvent(scrollEl);

    // Button is visible/accessible here — use getByRole.
    expect(screen.getByRole("button", { name: /scroll to top/i })).toHaveClass(
      "scroll-to-top-fab--visible",
    );

    // Simulate page unmount deregistering the container
    await act(async () => {
      registerScrollContainer(null);
    });

    // FAB should hide (no scrollable container, scrollTop effectively 0).
    // Button is hidden again (aria-hidden=true) — use getByTestId.
    const btn = getFabByTestId();
    expect(btn).not.toHaveClass("scroll-to-top-fab--visible");
  });
});

// ---------------------------------------------------------------------------
// Regression tests
// ---------------------------------------------------------------------------

describe("ScrollToTopFab — regressions", () => {
  it("regression: does not throw when rendered with no scroll container in DOM", () => {
    for (const el of document.querySelectorAll(".app-content")) {
      el.parentNode?.removeChild(el);
    }

    expect(() => renderFab("/live-messages")).not.toThrow();
  });

  it("regression: does not accumulate scroll listeners across container changes", async () => {
    const container1 = makeScrollElement(0);
    const container2 = makeScrollElement(0);

    registerScrollContainer(container1);
    renderFab("/live-messages");

    // Switch containers twice
    await act(async () => {
      registerScrollContainer(container2);
    });
    await act(async () => {
      registerScrollContainer(container1);
    });

    // container2 should have had its listener removed
    expect(container2.removeEventListener).toHaveBeenCalled();
  });
});
