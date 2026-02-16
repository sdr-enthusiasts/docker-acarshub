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
import { describe, expect, it } from "vitest";
import { Card } from "../Card";

describe("Card", () => {
  describe("Rendering", () => {
    it("should render card with children", () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText("Card content")).toBeInTheDocument();
    });

    it("should render with default variant", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card");
      expect(card).not.toHaveClass("card--info");
      expect(card).not.toHaveClass("card--success");
      expect(card).not.toHaveClass("card--warning");
      expect(card).not.toHaveClass("card--error");
    });

    it("should render with padding by default", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).not.toHaveClass("card--no-padding");
    });

    it("should not be hoverable by default", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).not.toHaveClass("card--hoverable");
    });

    it("should render content inside card__content wrapper", () => {
      const { container } = render(<Card>Test content</Card>);
      const content = container.querySelector(".card__content");
      expect(content).toBeInTheDocument();
      expect(content).toHaveTextContent("Test content");
    });
  });

  describe("Header", () => {
    it("should render title when provided", () => {
      render(<Card title="Card Title">Content</Card>);
      expect(screen.getByText("Card Title")).toBeInTheDocument();
    });

    it("should render subtitle when provided", () => {
      render(<Card subtitle="Card Subtitle">Content</Card>);
      expect(screen.getByText("Card Subtitle")).toBeInTheDocument();
    });

    it("should render both title and subtitle", () => {
      render(
        <Card title="Main Title" subtitle="Subtitle Text">
          Content
        </Card>,
      );
      expect(screen.getByText("Main Title")).toBeInTheDocument();
      expect(screen.getByText("Subtitle Text")).toBeInTheDocument();
    });

    it("should render header only when title or subtitle is provided", () => {
      const { container } = render(<Card>Content only</Card>);
      const header = container.querySelector(".card__header");
      expect(header).not.toBeInTheDocument();
    });

    it("should render header with only title", () => {
      const { container } = render(<Card title="Title">Content</Card>);
      const header = container.querySelector(".card__header");
      expect(header).toBeInTheDocument();
      expect(header?.querySelector(".card__title")).toBeInTheDocument();
      expect(header?.querySelector(".card__subtitle")).not.toBeInTheDocument();
    });

    it("should render header with only subtitle", () => {
      const { container } = render(<Card subtitle="Subtitle">Content</Card>);
      const header = container.querySelector(".card__header");
      expect(header).toBeInTheDocument();
      expect(header?.querySelector(".card__title")).not.toBeInTheDocument();
      expect(header?.querySelector(".card__subtitle")).toBeInTheDocument();
    });

    it("should render title as h3 element", () => {
      render(<Card title="Test Title">Content</Card>);
      const title = screen.getByText("Test Title");
      expect(title.tagName).toBe("H3");
      expect(title).toHaveClass("card__title");
    });

    it("should render subtitle as p element", () => {
      render(<Card subtitle="Test Subtitle">Content</Card>);
      const subtitle = screen.getByText("Test Subtitle");
      expect(subtitle.tagName).toBe("P");
      expect(subtitle).toHaveClass("card__subtitle");
    });
  });

  describe("Footer", () => {
    it("should render footer when provided", () => {
      render(<Card footer={<div>Footer content</div>}>Content</Card>);
      expect(screen.getByText("Footer content")).toBeInTheDocument();
    });

    it("should not render footer when not provided", () => {
      const { container } = render(<Card>Content</Card>);
      const footer = container.querySelector(".card__footer");
      expect(footer).not.toBeInTheDocument();
    });

    it("should render footer with proper class", () => {
      const { container } = render(
        <Card footer={<span>Footer</span>}>Content</Card>,
      );
      const footer = container.querySelector(".card__footer");
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveClass("card__footer");
    });

    it("should render JSX elements in footer", () => {
      render(
        <Card
          footer={
            <>
              <button type="button">Action 1</button>
              <button type="button">Action 2</button>
            </>
          }
        >
          Content
        </Card>,
      );
      expect(
        screen.getByRole("button", { name: "Action 1" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Action 2" }),
      ).toBeInTheDocument();
    });
  });

  describe("Variants", () => {
    it("should render default variant", () => {
      const { container } = render(<Card variant="default">Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card");
      expect(card).not.toHaveClass("card--default");
    });

    it("should render info variant", () => {
      const { container } = render(<Card variant="info">Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--info");
    });

    it("should render success variant", () => {
      const { container } = render(<Card variant="success">Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--success");
    });

    it("should render warning variant", () => {
      const { container } = render(<Card variant="warning">Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--warning");
    });

    it("should render error variant", () => {
      const { container } = render(<Card variant="error">Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--error");
    });
  });

  describe("Padding", () => {
    it("should add padding by default", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).not.toHaveClass("card--no-padding");
    });

    it("should add padding when explicitly set to true", () => {
      const { container } = render(<Card padded={true}>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).not.toHaveClass("card--no-padding");
    });

    it("should remove padding when set to false", () => {
      const { container } = render(<Card padded={false}>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--no-padding");
    });
  });

  describe("Hoverable", () => {
    it("should not be hoverable by default", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).not.toHaveClass("card--hoverable");
    });

    it("should not be hoverable when explicitly set to false", () => {
      const { container } = render(<Card hoverable={false}>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).not.toHaveClass("card--hoverable");
    });

    it("should be hoverable when set to true", () => {
      const { container } = render(<Card hoverable={true}>Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--hoverable");
    });
  });

  describe("Custom Props", () => {
    it("should accept custom className", () => {
      const { container } = render(
        <Card className="custom-class">Content</Card>,
      );
      const card = container.querySelector(".card");
      expect(card).toHaveClass("custom-class");
      expect(card).toHaveClass("card");
    });

    it("should combine multiple classNames", () => {
      const { container } = render(
        <Card className="class1 class2" variant="info" hoverable>
          Content
        </Card>,
      );
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card");
      expect(card).toHaveClass("card--info");
      expect(card).toHaveClass("card--hoverable");
      expect(card).toHaveClass("class1");
      expect(card).toHaveClass("class2");
    });

    it("should handle empty className", () => {
      const { container } = render(<Card className="">Content</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card");
      expect(card?.className).not.toContain("  "); // No double spaces
    });
  });

  describe("Complex Layouts", () => {
    it("should render all sections together", () => {
      const { container } = render(
        <Card
          title="Card Title"
          subtitle="Card Subtitle"
          footer={<button type="button">Action</button>}
          variant="success"
          hoverable
          className="custom"
        >
          Main content here
        </Card>,
      );

      expect(screen.getByText("Card Title")).toBeInTheDocument();
      expect(screen.getByText("Card Subtitle")).toBeInTheDocument();
      expect(screen.getByText("Main content here")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Action" }),
      ).toBeInTheDocument();

      const card = container.querySelector(".card");
      expect(card).toHaveClass("card");
      expect(card).toHaveClass("card--success");
      expect(card).toHaveClass("card--hoverable");
      expect(card).toHaveClass("custom");
    });

    it("should render JSX children", () => {
      render(
        <Card>
          <div>
            <h4>Inner heading</h4>
            <p>Inner paragraph</p>
          </div>
        </Card>,
      );

      expect(screen.getByText("Inner heading")).toBeInTheDocument();
      expect(screen.getByText("Inner paragraph")).toBeInTheDocument();
    });

    it("should render nested cards", () => {
      render(
        <Card title="Outer Card">
          <Card title="Inner Card">Inner content</Card>
        </Card>,
      );

      expect(screen.getByText("Outer Card")).toBeInTheDocument();
      expect(screen.getByText("Inner Card")).toBeInTheDocument();
      expect(screen.getByText("Inner content")).toBeInTheDocument();
    });

    it("should render with all options disabled", () => {
      const { container } = render(
        <Card padded={false} hoverable={false}>
          Content
        </Card>,
      );

      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--no-padding");
      expect(card).not.toHaveClass("card--hoverable");
    });
  });

  describe("Content Types", () => {
    it("should render text content", () => {
      render(<Card>Plain text content</Card>);
      expect(screen.getByText("Plain text content")).toBeInTheDocument();
    });

    it("should render number content", () => {
      render(<Card>{42}</Card>);
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("should render boolean content", () => {
      render(<Card>{true}</Card>);
      const { container } = render(<Card>{true}</Card>);
      const content = container.querySelector(".card__content");
      expect(content).toBeInTheDocument();
    });

    it("should render array content", () => {
      render(
        <Card>
          {["Item 1", "Item 2", "Item 3"].map((item) => (
            <div key={item}>{item}</div>
          ))}
        </Card>,
      );

      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
      expect(screen.getByText("Item 3")).toBeInTheDocument();
    });

    it("should render React elements", () => {
      render(
        <Card>
          <button type="button">Click me</button>
        </Card>,
      );

      expect(
        screen.getByRole("button", { name: "Click me" }),
      ).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("should handle undefined title gracefully", () => {
      const { container } = render(<Card title={undefined}>Content</Card>);
      const header = container.querySelector(".card__header");
      expect(header).not.toBeInTheDocument();
    });

    it("should handle empty string title", () => {
      const { container } = render(<Card title="">Content</Card>);
      const header = container.querySelector(".card__header");
      expect(header).not.toBeInTheDocument();
    });

    it("should handle undefined subtitle gracefully", () => {
      const { container } = render(<Card subtitle={undefined}>Content</Card>);
      const header = container.querySelector(".card__header");
      expect(header).not.toBeInTheDocument();
    });

    it("should handle empty string subtitle", () => {
      const { container } = render(<Card subtitle="">Content</Card>);
      const header = container.querySelector(".card__header");
      expect(header).not.toBeInTheDocument();
    });

    it("should handle undefined footer gracefully", () => {
      const { container } = render(<Card footer={undefined}>Content</Card>);
      const footer = container.querySelector(".card__footer");
      expect(footer).not.toBeInTheDocument();
    });

    it("should handle null footer", () => {
      const { container } = render(<Card footer={null}>Content</Card>);
      const footer = container.querySelector(".card__footer");
      expect(footer).not.toBeInTheDocument();
    });

    it("should handle long title text", () => {
      const longTitle = "A".repeat(200);
      render(<Card title={longTitle}>Content</Card>);
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it("should handle long content", () => {
      const longContent = "B".repeat(1000);
      render(<Card>{longContent}</Card>);
      expect(screen.getByText(longContent)).toBeInTheDocument();
    });

    it("should handle special characters in content", () => {
      render(<Card>{"<div>Special & chars</div>"}</Card>);
      expect(
        screen.getByText("<div>Special & chars</div>"),
      ).toBeInTheDocument();
    });
  });

  describe("Structure", () => {
    it("should have correct DOM structure", () => {
      const { container } = render(
        <Card title="Title" subtitle="Subtitle" footer="Footer">
          Content
        </Card>,
      );

      const card = container.querySelector(".card");
      expect(card).toBeInTheDocument();

      const header = card?.querySelector(".card__header");
      expect(header).toBeInTheDocument();
      expect(header?.querySelector(".card__title")).toBeInTheDocument();
      expect(header?.querySelector(".card__subtitle")).toBeInTheDocument();

      const content = card?.querySelector(".card__content");
      expect(content).toBeInTheDocument();

      const footer = card?.querySelector(".card__footer");
      expect(footer).toBeInTheDocument();
    });

    it("should maintain correct DOM order (header, content, footer)", () => {
      const { container } = render(
        <Card title="Title" footer="Footer">
          Content
        </Card>,
      );

      const card = container.querySelector(".card");
      const children = Array.from(card?.children || []);

      expect(children[0]).toHaveClass("card__header");
      expect(children[1]).toHaveClass("card__content");
      expect(children[2]).toHaveClass("card__footer");
    });

    it("should maintain correct structure without header", () => {
      const { container } = render(<Card footer="Footer">Content</Card>);

      const card = container.querySelector(".card");
      const children = Array.from(card?.children || []);

      expect(children[0]).toHaveClass("card__content");
      expect(children[1]).toHaveClass("card__footer");
      expect(children.length).toBe(2);
    });

    it("should maintain correct structure without footer", () => {
      const { container } = render(<Card title="Title">Content</Card>);

      const card = container.querySelector(".card");
      const children = Array.from(card?.children || []);

      expect(children[0]).toHaveClass("card__header");
      expect(children[1]).toHaveClass("card__content");
      expect(children.length).toBe(2);
    });

    it("should only have content when no header or footer", () => {
      const { container } = render(<Card>Content only</Card>);

      const card = container.querySelector(".card");
      const children = Array.from(card?.children || []);

      expect(children[0]).toHaveClass("card__content");
      expect(children.length).toBe(1);
    });
  });
});
