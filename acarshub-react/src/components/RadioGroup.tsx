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
 * Radio Option Definition
 */
export interface RadioOption {
  /** Unique value for this option */
  value: string | number;
  /** Display label for this option */
  label: string;
  /** Optional description text */
  description?: string;
  /** Whether this option is disabled */
  disabled?: boolean;
}

/**
 * RadioGroup Component Props
 */
export interface RadioGroupProps {
  /** Unique identifier for the radio group */
  name: string;
  /** Group label text */
  label: string;
  /** Current selected value */
  value: string | number;
  /** Available radio options */
  options: RadioOption[];
  /** Change handler callback */
  onChange: (value: string | number) => void;
  /** Help text displayed below the group */
  helpText?: string;
  /** Whether the group is disabled */
  disabled?: boolean;
  /** Whether a selection is required */
  required?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Layout direction */
  direction?: "vertical" | "horizontal";
}

/**
 * RadioGroup Component
 *
 * Custom-styled radio button group with Catppuccin theming
 * Provides accessible form control with label and help text
 *
 * @example
 * ```tsx
 * <RadioGroup
 *   name="theme"
 *   label="Theme Preference"
 *   value={theme}
 *   options={[
 *     { value: "mocha", label: "Dark (Mocha)", description: "Dark color scheme" },
 *     { value: "latte", label: "Light (Latte)", description: "Light color scheme" }
 *   ]}
 *   onChange={setTheme}
 *   helpText="Choose your preferred color theme"
 * />
 * ```
 */
export function RadioGroup({
  name,
  label,
  value,
  options,
  onChange,
  helpText,
  disabled = false,
  required = false,
  className = "",
  direction = "vertical",
}: RadioGroupProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Try to preserve number type if original value was a number
    if (typeof value === "number") {
      onChange(Number(newValue));
    } else {
      onChange(newValue);
    }
  };

  const groupClasses = [
    "radio-group",
    `radio-group--${direction}`,
    disabled && "radio-group--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <fieldset className={groupClasses} disabled={disabled}>
      <legend className="radio-group__legend">
        {label}
        {required && <span className="radio-group__required"> *</span>}
      </legend>

      {helpText && (
        <p id={`${name}-help`} className="radio-group__help-text">
          {helpText}
        </p>
      )}

      <div className="radio-group__options">
        {options.map((option) => {
          const optionId = `${name}-${option.value}`;
          const isChecked = value === option.value;
          const isDisabled = disabled || option.disabled;

          return (
            <div key={option.value} className="radio-option">
              <input
                type="radio"
                id={optionId}
                name={name}
                value={option.value}
                checked={isChecked}
                onChange={handleChange}
                disabled={isDisabled}
                required={required && !isChecked}
                className="radio-option__input"
                aria-describedby={
                  option.description ? `${optionId}-desc` : undefined
                }
              />
              <label htmlFor={optionId} className="radio-option__label">
                <span className="radio-option__indicator">
                  <span className="radio-option__dot" />
                </span>
                <span className="radio-option__content">
                  <span className="radio-option__text">{option.label}</span>
                  {option.description && (
                    <span
                      id={`${optionId}-desc`}
                      className="radio-option__description"
                    >
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
