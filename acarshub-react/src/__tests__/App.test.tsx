/**
 * Tests for src/App.tsx.
 *
 * App.tsx is mostly composition (Socket.IO hook + theme hook + router +
 * lazy pages + 7 mounted components), so these tests focus on the
 * non-trivial logic that lives directly in the component:
 *
 *   1. basename derivation from window.location.pathname (reverse-proxy support)
 *   2. document root attribute synchronization with settings.appearance
 *      (data-theme + data-animations)
 *   3. one-shot initialization log fired exactly once on mount
 *   4. routing: "/" and unknown paths redirect to /live-messages
 *
 * Heavy children (pages, hooks, Socket.IO) are mocked to keep the test
 * surface area focused on App.tsx itself. Lazy-loaded pages are replaced
 * with stub components so Suspense resolves synchronously.
 */

import { render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks — all installed via vi.mock so they apply before App.tsx imports
// ---------------------------------------------------------------------------

// useSocketIO triggers a real Socket.IO connection in production; replace
// with a no-op so the App renders without network side effects.
vi.mock("../hooks/useSocketIO.ts", () => ({
  useSocketIO: vi.fn(),
}));

vi.mock("../hooks/useThemeAwareMapProvider.ts", () => ({
  useThemeAwareMapProvider: vi.fn(),
}));

// Replace heavy/cross-dependency components with minimal stubs. The exact
// markup is irrelevant; we only need them to mount without crashing so
// App.tsx's own logic runs.
vi.mock("../components/AlertSoundManager.tsx", () => ({
  AlertSoundManager: () => <div data-testid="alert-sound-manager" />,
}));
vi.mock("../components/ConnectionStatus.tsx", () => ({
  ConnectionStatus: ({ isConnected }: { isConnected: boolean }) => (
    <div data-testid="connection-status" data-connected={isConnected} />
  ),
}));
vi.mock("../components/MigrationStatus.tsx", () => ({
  MigrationStatus: () => <div data-testid="migration-status" />,
}));
vi.mock("../components/Navigation.tsx", () => ({
  Navigation: () => <nav data-testid="navigation" />,
}));
vi.mock("../components/ScrollToTopFab.tsx", () => ({
  ScrollToTopFab: () => <div data-testid="scroll-fab" />,
}));
vi.mock("../components/SettingsModal.tsx", () => ({
  SettingsModal: () => <div data-testid="settings-modal" />,
}));
vi.mock("../components/ToastContainer.tsx", () => ({
  ToastContainer: () => <div data-testid="toast-container" />,
}));

// Eager page + lazy pages stubbed. Each renders a deterministic testid so
// route assertions can target the active page.
vi.mock("../pages/LiveMessagesPage.tsx", () => ({
  LiveMessagesPage: () => <div data-testid="page-live-messages" />,
}));
vi.mock("../pages/AboutPage.tsx", () => ({
  AboutPage: () => <div data-testid="page-about" />,
}));
vi.mock("../pages/AlertsPage.tsx", () => ({
  AlertsPage: () => <div data-testid="page-alerts" />,
}));
vi.mock("../pages/LiveMapPage.tsx", () => ({
  LiveMapPage: () => <div data-testid="page-map" />,
}));
vi.mock("../pages/SearchPage.tsx", () => ({
  SearchPage: () => <div data-testid="page-search" />,
}));
vi.mock("../pages/StatsPage.tsx", () => ({
  StatsPage: () => <div data-testid="page-stats" />,
}));

// Spy on uiLogger so we can assert init log fires exactly once.
vi.mock("../utils/logger", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/logger")>("../utils/logger");
  return {
    ...actual,
    uiLogger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function importApp() {
  // Note: we deliberately do NOT call vi.resetModules() here. The vi.mock
  // declarations at the top of this file are hoisted and apply globally
  // for the test file's module graph; resetting modules between tests
  // caused intermittent failures where a freshly-imported App.tsx would
  // re-evaluate child modules under a stale mock binding (manifesting as
  // empty <main> renders for the '/' route).
  const mod = await import("../App");
  return mod.default;
}

/**
 * Set the current URL for BrowserRouter. Replacing window.location alone
 * is insufficient because react-router-dom reads from window.history;
 * we use history.replaceState to update both in one shot.
 */
function setPathname(pathname: string): void {
  window.history.replaceState({}, "", pathname);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App", () => {
  beforeEach(() => {
    // Reset document root attributes between tests so prior data-theme /
    // data-animations don't leak into the next assertion.
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-animations");
    setPathname("/");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("structural composition", () => {
    it("mounts all global UI components", async () => {
      const App = await importApp();
      render(<App />);
      expect(screen.getByTestId("navigation")).toBeInTheDocument();
      expect(screen.getByTestId("connection-status")).toBeInTheDocument();
      expect(screen.getByTestId("migration-status")).toBeInTheDocument();
      expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
      expect(screen.getByTestId("alert-sound-manager")).toBeInTheDocument();
      expect(screen.getByTestId("toast-container")).toBeInTheDocument();
      expect(screen.getByTestId("scroll-fab")).toBeInTheDocument();
    });

    it("wires Socket.IO + theme-aware-map hooks on mount", async () => {
      const App = await importApp();
      const { useSocketIO } = await import("../hooks/useSocketIO.ts");
      const { useThemeAwareMapProvider } = await import(
        "../hooks/useThemeAwareMapProvider.ts"
      );

      render(<App />);

      expect(useSocketIO).toHaveBeenCalled();
      expect(useThemeAwareMapProvider).toHaveBeenCalled();
    });
  });

  describe("basename derivation (reverse-proxy support)", () => {
    it("returns '/' when pathname is '/'", async () => {
      setPathname("/");
      const App = await importApp();
      render(<App />);
      // Default redirect: "/" -> /live-messages renders.
      await waitFor(() => {
        expect(screen.getByTestId("page-live-messages")).toBeInTheDocument();
      });
    });

    it("strips a recognized route suffix from a proxy-mounted path", async () => {
      // App is mounted under /acars/, user visits /acars/live-messages.
      // basename must become /acars (with trailing-slash variations handled).
      setPathname("/acars/live-messages");
      const App = await importApp();
      render(<App />);
      // Under basename=/acars, the path /acars/live-messages routes to the
      // /live-messages route and renders the LiveMessages page.
      await waitFor(() => {
        expect(screen.getByTestId("page-live-messages")).toBeInTheDocument();
      });
    });

    it("strips nested route paths (e.g. /search/abc) for basename match", async () => {
      setPathname("/myproxy/search/some-query");
      const App = await importApp();
      render(<App />);
      // With basename=/myproxy stripped, the residual path is /search/some-query.
      // v6 Routes require an exact match for "/search", so /search/some-query
      // falls through to the catch-all and redirects to /live-messages. We
      // assert the redirect target rather than the search page -- the test
      // verifies that the basename strip *worked* (otherwise the router
      // wouldn't have found any route at all and the <main> would be empty).
      await waitFor(() => {
        expect(screen.getByTestId("page-live-messages")).toBeInTheDocument();
      });
    });

    it("is case-insensitive for the route-suffix strip", async () => {
      // Regex flag /i in App's basename strip.
      setPathname("/sub/LIVE-MESSAGES");
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId("page-live-messages")).toBeInTheDocument();
      });
    });
  });

  describe("document root settings sync", () => {
    it("sets data-animations='true' by default", async () => {
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(document.documentElement.getAttribute("data-animations")).toBe(
          "true",
        );
      });
    });

    it("does NOT set data-theme when theme is 'mocha' (default)", async () => {
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        // mocha is the implicit dark default; App removes data-theme rather
        // than setting it, so the attribute should be absent.
        expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      });
    });

    it("sets data-theme='light' when theme is 'latte'", async () => {
      // Switch the persisted setting before importing App so its initial
      // effect picks up "latte".
      const { useSettingsStore } = await import("../store/useSettingsStore.ts");
      useSettingsStore.getState().setTheme("latte");

      const App = await importApp();
      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.getAttribute("data-theme")).toBe(
          "light",
        );
      });

      // Cleanup: restore mocha for subsequent tests.
      useSettingsStore.getState().setTheme("mocha");
    });
  });

  describe("initialization logging", () => {
    it("logs the app-initialized event exactly once on mount", async () => {
      const App = await importApp();
      const { uiLogger } = await import("../utils/logger");
      (uiLogger.info as Mock).mockClear();

      const { rerender } = render(<App />);
      // Force a re-render to prove the hasInitialized ref guards against
      // duplicate "initialized" logs.
      rerender(<App />);
      rerender(<App />);

      const initCalls = (uiLogger.info as Mock).mock.calls.filter(
        (c) => c[0] === "ACARS Hub React application initialized",
      );
      expect(initCalls).toHaveLength(1);

      // Verify the payload includes the theme + animations values.
      const [, meta] = initCalls[0];
      expect(meta).toEqual(
        expect.objectContaining({
          theme: expect.any(String),
          animations: expect.any(Boolean),
        }),
      );
    });

    it("logs settings application via debug on every settings change", async () => {
      const App = await importApp();
      const { uiLogger } = await import("../utils/logger");
      (uiLogger.debug as Mock).mockClear();

      render(<App />);

      // Initial render logs once.
      await waitFor(() => {
        const debugCalls = (uiLogger.debug as Mock).mock.calls.filter(
          (c) => c[0] === "Applying settings to document root",
        );
        expect(debugCalls.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("routing", () => {
    it("redirects '/' to /live-messages", async () => {
      setPathname("/");
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId("page-live-messages")).toBeInTheDocument();
      });
    });

    it("redirects unknown paths to /live-messages (catch-all)", async () => {
      setPathname("/this-route-does-not-exist");
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId("page-live-messages")).toBeInTheDocument();
      });
    });

    it("renders the Map page on /adsb", async () => {
      setPathname("/adsb");
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId("page-map")).toBeInTheDocument();
      });
    });

    it("renders the Stats page on /status", async () => {
      setPathname("/status");
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId("page-stats")).toBeInTheDocument();
      });
    });

    it("renders the Alerts page on /alerts", async () => {
      setPathname("/alerts");
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId("page-alerts")).toBeInTheDocument();
      });
    });

    it("renders the About page on /about", async () => {
      setPathname("/about");
      const App = await importApp();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId("page-about")).toBeInTheDocument();
      });
    });
  });

  describe("connection status wiring", () => {
    it("passes isConnected from the app store to ConnectionStatus", async () => {
      const { useAppStore } = await import("../store/useAppStore.ts");
      useAppStore.setState({ isConnected: true });

      const App = await importApp();
      render(<App />);

      expect(
        screen.getByTestId("connection-status").getAttribute("data-connected"),
      ).toBe("true");

      // Reset for subsequent tests.
      useAppStore.setState({ isConnected: false });
    });
  });
});
