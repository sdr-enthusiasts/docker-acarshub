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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  describe("Rendering", () => {
    it("should render button with children", () => {
      render(<Button>Click me</Button>);
      expect(
        screen.getByRole("button", { name: /click me/i }),
      ).toBeInTheDocument();
    });

    it("should render with default variant (primary)", () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("btn--primary");
    });

    it("should render with default size (md)", () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("btn");
      expect(button).not.toHaveClass("btn--sm");
      expect(button).not.toHaveClass("btn--lg");
    });

    it("should render with default type (button)", () => {
      render(<Button>Button</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "button");
    });
  });

  describe("Variants", () => {
    it("should render primary variant", () => {
      render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--primary");
    });

    it("should render secondary variant", () => {
      render(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--secondary");
    });

    it("should render success variant", () => {
      render(<Button variant="success">Success</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--success");
    });

    it("should render danger variant", () => {
      render(<Button variant="danger">Danger</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--danger");
    });

    it("should render warning variant", () => {
      render(<Button variant="warning">Warning</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--warning");
    });

    it("should render info variant", () => {
      render(<Button variant="info">Info</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--info");
    });

    it("should render ghost variant", () => {
      render(<Button variant="ghost">Ghost</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--ghost");
    });

    it("should render outline-primary variant", () => {
      render(<Button variant="outline-primary">Outline Primary</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--outline-primary");
    });

    it("should render outline-secondary variant", () => {
      render(<Button variant="outline-secondary">Outline Secondary</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--outline-secondary");
    });

    it("should render outline-success variant", () => {
      render(<Button variant="outline-success">Outline Success</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--outline-success");
    });

    it("should render outline-danger variant", () => {
      render(<Button variant="outline-danger">Outline Danger</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--outline-danger");
    });

    it("should render outline-warning variant", () => {
      render(<Button variant="outline-warning">Outline Warning</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--outline-warning");
    });

    it("should render outline-info variant", () => {
      render(<Button variant="outline-info">Outline Info</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--outline-info");
    });
  });

  describe("Sizes", () => {
    it("should render small size", () => {
      render(<Button size="sm">Small</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--sm");
    });

    it("should render medium size (no extra class)", () => {
      render(<Button size="md">Medium</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("btn");
      expect(button).not.toHaveClass("btn--sm");
      expect(button).not.toHaveClass("btn--lg");
    });

    it("should render large size", () => {
      render(<Button size="lg">Large</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--lg");
    });
  });

  describe("States", () => {
    it("should render loading state", () => {
      render(<Button loading>Loading</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("btn--loading");
      expect(button).toBeDisabled();
    });

    it("should render disabled state", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should be disabled when loading even if not explicitly disabled", () => {
      render(
        <Button loading disabled={false}>
          Loading
        </Button>,
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("should render block style", () => {
      render(<Button block>Block</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--block");
    });

    it("should render icon-only style", () => {
      render(<Button iconOnly>×</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--icon");
    });
  });

  describe("Custom Props", () => {
    it("should accept custom className", () => {
      render(<Button className="custom-class">Custom</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
      expect(button).toHaveClass("btn");
    });

    it("should accept custom type attribute", () => {
      render(<Button type="submit">Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });

    it("should accept custom aria-label", () => {
      render(<Button aria-label="Custom label">Icon</Button>);
      expect(screen.getByRole("button")).toHaveAccessibleName("Custom label");
    });

    it("should accept custom data attributes", () => {
      render(<Button data-testid="custom-button">Data Attr</Button>);
      expect(screen.getByTestId("custom-button")).toBeInTheDocument();
    });

    it("should forward id attribute", () => {
      render(<Button id="my-button">ID</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("id", "my-button");
    });

    it("should forward title attribute", () => {
      render(<Button title="Tooltip text">Title</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "title",
        "Tooltip text",
      );
    });
  });

  describe("Event Handlers", () => {
    it("should call onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click</Button>);

      await user.click(screen.getByRole("button"));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should not call onClick when disabled", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <Button onClick={handleClick} disabled>
          Disabled
        </Button>,
      );

      await user.click(screen.getByRole("button"));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should not call onClick when loading", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <Button onClick={handleClick} loading>
          Loading
        </Button>,
      );

      await user.click(screen.getByRole("button"));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should call onMouseEnter when hovered", async () => {
      const user = userEvent.setup();
      const handleMouseEnter = vi.fn();
      render(<Button onMouseEnter={handleMouseEnter}>Hover</Button>);

      await user.hover(screen.getByRole("button"));

      expect(handleMouseEnter).toHaveBeenCalledTimes(1);
    });

    it("should call onFocus when focused", async () => {
      const user = userEvent.setup();
      const handleFocus = vi.fn();
      render(<Button onFocus={handleFocus}>Focus</Button>);

      await user.tab();

      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it("should call onBlur when blurred", async () => {
      const user = userEvent.setup();
      const handleBlur = vi.fn();
      render(<Button onBlur={handleBlur}>Blur</Button>);

      const button = screen.getByRole("button");
      await user.click(button);
      await user.tab();

      expect(handleBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe("Keyboard Interactions", () => {
    it("should be focusable with Tab key", async () => {
      const user = userEvent.setup();
      render(<Button>Focusable</Button>);

      await user.tab();

      expect(screen.getByRole("button")).toHaveFocus();
    });

    it("should trigger onClick with Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Enter</Button>);

      const button = screen.getByRole("button");
      button.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should trigger onClick with Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Space</Button>);

      const button = screen.getByRole("button");
      button.focus();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should not be focusable when disabled", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Button disabled>Disabled</Button>
          <Button>Enabled</Button>
        </>,
      );

      await user.tab();

      // Should skip disabled button and focus the enabled one
      expect(screen.getByRole("button", { name: /enabled/i })).toHaveFocus();
    });
  });

  describe("Accessibility", () => {
    it("should have button role", () => {
      render(<Button>Button</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should have accessible name from children", () => {
      render(<Button>Submit Form</Button>);
      expect(screen.getByRole("button")).toHaveAccessibleName("Submit Form");
    });

    it("should support aria-label for icon-only buttons", () => {
      render(
        <Button iconOnly aria-label="Close">
          ×
        </Button>,
      );
      expect(screen.getByRole("button")).toHaveAccessibleName("Close");
    });

    it("should support aria-disabled attribute", () => {
      render(<Button aria-disabled="true">Aria Disabled</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("should support aria-busy for loading state", () => {
      render(
        <Button loading aria-busy="true">
          Loading
        </Button>,
      );
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });

    it("should support aria-pressed for toggle buttons", () => {
      render(<Button aria-pressed="true">Pressed</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  describe("Complex Scenarios", () => {
    it("should combine multiple classes correctly", () => {
      render(
        <Button variant="success" size="lg" loading block className="custom">
          Complex
        </Button>,
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("btn");
      expect(button).toHaveClass("btn--success");
      expect(button).toHaveClass("btn--lg");
      expect(button).toHaveClass("btn--loading");
      expect(button).toHaveClass("btn--block");
      expect(button).toHaveClass("custom");
    });

    it("should handle all props together", () => {
      const handleClick = vi.fn();
      render(
        <Button
          variant="outline-danger"
          size="sm"
          loading
          block
          iconOnly
          className="test-class"
          onClick={handleClick}
          data-testid="complex-button"
          aria-label="Delete item"
        >
          ×
        </Button>,
      );

      const button = screen.getByTestId("complex-button");
      expect(button).toHaveClass("btn");
      expect(button).toHaveClass("btn--outline-danger");
      expect(button).toHaveClass("btn--sm");
      expect(button).toHaveClass("btn--loading");
      expect(button).toHaveClass("btn--block");
      expect(button).toHaveClass("btn--icon");
      expect(button).toHaveClass("test-class");
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleName("Delete item");
    });

    it("should render JSX children", () => {
      render(
        <Button>
          <span>Icon</span> Text
        </Button>,
      );

      const button = screen.getByRole("button");
      expect(button).toHaveTextContent("Icon Text");
    });

    it("should handle rapid state changes", () => {
      const { rerender } = render(<Button>Normal</Button>);
      expect(screen.getByRole("button")).not.toBeDisabled();

      rerender(<Button loading>Loading</Button>);
      expect(screen.getByRole("button")).toBeDisabled();

      rerender(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button")).toBeDisabled();

      rerender(<Button>Normal</Button>);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string className", () => {
      render(<Button className="">Empty</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("btn");
      expect(button.className).not.toContain("  "); // No double spaces
    });

    it("should handle undefined children gracefully", () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing edge case with undefined children
      render(<Button>{undefined as any}</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle number children", () => {
      render(<Button>{42}</Button>);
      expect(screen.getByRole("button")).toHaveTextContent("42");
    });

    it("should handle boolean props correctly", () => {
      render(
        <Button loading={false} block={false} iconOnly={false}>
          Bool
        </Button>,
      );
      const button = screen.getByRole("button");
      expect(button).not.toHaveClass("btn--loading");
      expect(button).not.toHaveClass("btn--block");
      expect(button).not.toHaveClass("btn--icon");
      expect(button).not.toBeDisabled();
    });

    it("should handle multiple className values", () => {
      render(<Button className="class1 class2 class3">Multi</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("btn");
      expect(button).toHaveClass("class1");
      expect(button).toHaveClass("class2");
      expect(button).toHaveClass("class3");
    });
  });
});
