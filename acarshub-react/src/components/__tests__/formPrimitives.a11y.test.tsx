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

/**
 * Design-system form-primitive accessibility suite.
 *
 * Runs axe-core (WCAG 2.0/2.1 A + AA) against the canonical rendered
 * state of each primitive. The goal is to catch a11y regressions in
 * shared components at unit-test speed, well before the Playwright
 * sweep in `e2e/accessibility.spec.ts`.
 *
 * Each block renders the most common shape of the component (the same
 * one the existing component tests use as their first render) and
 * asserts zero violations. We deliberately keep these tests minimal —
 * deep behavioural assertions live in the per-component test files;
 * this file's only job is the a11y gate.
 */

import { render } from "@testing-library/react";
import { act } from "react";
import { beforeAll, beforeEach, describe, it, vi } from "vitest";
import { useToastStore } from "../../store/useToastStore";
import { expectNoA11yViolations } from "../../test/a11y";
import { Button } from "../Button";
import { Card } from "../Card";
import { Modal } from "../Modal";
import { RadioGroup } from "../RadioGroup";
import { Select } from "../Select";
import { TabSwitcher } from "../TabSwitcher";
import { Toast } from "../Toast";
import { ToastContainer } from "../ToastContainer";
import { Toggle } from "../Toggle";

// jsdom doesn't implement scrollIntoView; TabSwitcher calls it inside
// a useEffect when the active tab changes. Stub it once for the whole
// suite — see TabSwitcher.test.tsx for the same workaround.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("a11y: design-system form primitives", () => {
  describe("Button", () => {
    it("default variant has no WCAG 2.1 AA violations", async () => {
      const { container } = render(<Button>Submit</Button>);
      await expectNoA11yViolations(container);
    });

    it("disabled state has no WCAG 2.1 AA violations", async () => {
      const { container } = render(<Button disabled>Submit</Button>);
      await expectNoA11yViolations(container);
    });

    it("danger variant has no WCAG 2.1 AA violations", async () => {
      const { container } = render(<Button variant="danger">Delete</Button>);
      await expectNoA11yViolations(container);
    });
  });

  describe("Card", () => {
    it("default variant has no WCAG 2.1 AA violations", async () => {
      const { container } = render(
        <Card>
          <p>Card body</p>
        </Card>,
      );
      await expectNoA11yViolations(container);
    });
  });

  describe("Toggle", () => {
    it("checked + unchecked states have no WCAG 2.1 AA violations", async () => {
      const { container: off } = render(
        <Toggle
          id="t1"
          label="Notifications"
          checked={false}
          onChange={vi.fn()}
        />,
      );
      await expectNoA11yViolations(off);

      const { container: on } = render(
        <Toggle
          id="t2"
          label="Notifications"
          checked={true}
          onChange={vi.fn()}
        />,
      );
      await expectNoA11yViolations(on);
    });

    it("with helpText (aria-describedby wired) has no violations", async () => {
      const { container } = render(
        <Toggle
          id="t3"
          label="Notifications"
          checked={false}
          onChange={vi.fn()}
          helpText="Play a sound when a new alert arrives"
        />,
      );
      await expectNoA11yViolations(container);
    });
  });

  describe("Select", () => {
    it("renders with a visible label and no violations", async () => {
      const { container } = render(
        <Select
          id="s1"
          label="Time Format"
          value="auto"
          options={[
            { value: "auto", label: "Auto" },
            { value: "12h", label: "12-hour" },
            { value: "24h", label: "24-hour" },
          ]}
          onChange={vi.fn()}
        />,
      );
      await expectNoA11yViolations(container);
    });

    it("renders with helpText (aria-describedby wired) and no violations", async () => {
      const { container } = render(
        <Select
          id="s2"
          label="Time Format"
          value="auto"
          options={[
            { value: "auto", label: "Auto" },
            { value: "12h", label: "12-hour" },
          ]}
          onChange={vi.fn()}
          helpText="Auto follows your locale"
        />,
      );
      await expectNoA11yViolations(container);
    });
  });

  describe("RadioGroup", () => {
    it("renders as a fieldset/legend with no violations", async () => {
      const { container } = render(
        <RadioGroup
          name="theme"
          label="Theme Preference"
          value="mocha"
          options={[
            { value: "mocha", label: "Mocha" },
            { value: "latte", label: "Latte" },
          ]}
          onChange={vi.fn()}
        />,
      );
      await expectNoA11yViolations(container);
    });
  });

  describe("TabSwitcher", () => {
    it("renders tablist + tabs with no violations", async () => {
      const { container } = render(
        <TabSwitcher
          tabs={[
            { id: "general", label: "General" },
            { id: "display", label: "Display" },
            { id: "alerts", label: "Alerts" },
          ]}
          activeTab="general"
          onTabChange={vi.fn()}
          ariaLabel="Settings sections"
        />,
      );
      await expectNoA11yViolations(container);
    });
  });

  describe("Modal", () => {
    it("open modal with a title has no violations", async () => {
      // Modal portals into document.body; pass document.body as the axe
      // root so the portalled dialog node is actually scanned. (The
      // render container is empty when isOpen=true because the dialog
      // node escapes to body via createPortal.)
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Settings">
          <p>Configure your preferences below.</p>
        </Modal>,
      );
      await expectNoA11yViolations(document.body);
    });
  });

  describe("Toast", () => {
    it("info toast has no violations", async () => {
      const { container } = render(
        <Toast id="t1" message="Connection restored" onDismiss={vi.fn()} />,
      );
      await expectNoA11yViolations(container);
    });
  });

  describe("ToastContainer", () => {
    beforeEach(() => {
      // Reset the global store between tests so prior toast state
      // doesn't bleed into the snapshot we're scanning.
      act(() => {
        useToastStore.getState().clearAllToasts();
      });
    });

    it("empty state has no violations", async () => {
      const { container } = render(<ToastContainer />);
      await expectNoA11yViolations(container);
    });

    it("populated with a single toast has no violations", async () => {
      const { container } = render(<ToastContainer />);
      act(() => {
        useToastStore.getState().showToast({
          variant: "success",
          message: "Connection restored",
        });
      });
      await expectNoA11yViolations(container);
    });
  });
});
