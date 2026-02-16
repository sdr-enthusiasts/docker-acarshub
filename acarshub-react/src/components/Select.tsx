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

import type { SelectOption } from "../types";

/**
 * Select Component Props
 */
export interface SelectProps {
  /** Unique identifier for the select field */
  id: string;
  /** Label text displayed above the select */
  label: string;
  /** Current selected value */
  value: string | number;
  /** Available options */
  options: SelectOption[];
  /** Change handler callback */
  onChange: (value: string | number) => void;
  /** Help text displayed below the select */
  helpText?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether the select spans full width */
  fullWidth?: boolean;
}

/**
 * Select Component
 *
 * Custom-styled select dropdown with Catppuccin theming
 * Provides accessible form control with label and help text
 *
 * @example
 * ```tsx
 * <Select
 *   id="time-format"
 *   label="Time Format"
 *   value={timeFormat}
 *   options={[
 *     { value: "auto", label: "Auto-detect" },
 *     { value: "12h", label: "12-hour" },
 *     { value: "24h", label: "24-hour" }
 *   ]}
 *   onChange={setTimeFormat}
 *   helpText="Choose your preferred time display format"
 * />
 * ```
 */
export function Select({
  id,
  label,
  value,
  options,
  onChange,
  helpText,
  disabled = false,
  required = false,
  className = "",
  fullWidth = false,
}: SelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    // Try to preserve number type if original value was a number
    if (typeof value === "number") {
      onChange(Number(newValue));
    } else {
      onChange(newValue);
    }
  };

  const wrapperClasses = [
    "select-wrapper",
    fullWidth && "select-wrapper--full-width",
    disabled && "select-wrapper--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClasses}>
      <label htmlFor={id} className="select-label">
        {label}
        {required && <span className="select-label__required"> *</span>}
      </label>

      <div className="select-container">
        <select
          id={id}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          className="select"
          aria-describedby={helpText ? `${id}-help` : undefined}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        <div className="select-icon" aria-hidden="true">
          ▼
        </div>
      </div>

      {helpText && (
        <p id={`${id}-help`} className="select-help-text">
          {helpText}
        </p>
      )}
    </div>
  );
}
