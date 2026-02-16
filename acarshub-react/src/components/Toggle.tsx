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

/**
 * Toggle Component Props
 */
export interface ToggleProps {
  /** Unique identifier for the toggle */
  id: string;
  /** Label text displayed next to the toggle */
  label: string;
  /** Current checked state */
  checked: boolean;
  /** Change handler callback */
  onChange: (checked: boolean) => void;
  /** Help text displayed below the toggle */
  helpText?: string;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "small" | "medium" | "large";
}

/**
 * Toggle/Switch Component
 *
 * Custom-styled toggle switch with Catppuccin theming
 * Provides accessible form control with label and help text
 *
 * @example
 * ```tsx
 * <Toggle
 *   id="animations"
 *   label="Enable Animations"
 *   checked={animationsEnabled}
 *   onChange={setAnimationsEnabled}
 *   helpText="Show smooth transitions and effects"
 * />
 * ```
 */
export function Toggle({
  id,
  label,
  checked,
  onChange,
  helpText,
  disabled = false,
  className = "",
  size = "medium",
}: ToggleProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  const wrapperClasses = [
    "toggle-wrapper",
    `toggle-wrapper--${size}`,
    disabled && "toggle-wrapper--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClasses}>
      <div className="toggle-control">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="toggle-input"
          role="switch"
          aria-checked={checked}
          aria-describedby={helpText ? `${id}-help` : undefined}
        />
        <label htmlFor={id} className="toggle-slider">
          <span className="toggle-slider__track">
            <span className="toggle-slider__thumb" />
          </span>
        </label>
      </div>

      <div className="toggle-labels">
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        {helpText && (
          <p id={`${id}-help`} className="toggle-help-text">
            {helpText}
          </p>
        )}
      </div>
    </div>
  );
}
