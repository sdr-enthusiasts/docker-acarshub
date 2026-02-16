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
 * Validation Utility Functions
 * Provides input validation and data checking utilities
 */

/**
 * Validates if a string is a valid email address
 * @param email - Email string to validate
 * @returns true if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates if a string is a valid URL
 * @param url - URL string to validate
 * @returns true if valid URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a string is a valid hex color code
 * @param color - Color string to validate
 * @returns true if valid hex color (#RGB or #RRGGBB)
 */
export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Validates if a string is a valid ICAO code (6 hex characters)
 * @param icao - ICAO code to validate
 * @returns true if valid ICAO format
 */
export function isValidIcao(icao: string): boolean {
  return /^[A-Fa-f0-9]{6}$/.test(icao);
}

/**
 * Validates if a string is a valid frequency (MHz)
 * @param freq - Frequency string to validate
 * @returns true if valid frequency format
 */
export function isValidFrequency(freq: string | number): boolean {
  const freqNum = typeof freq === "string" ? parseFloat(freq) : freq;
  return !Number.isNaN(freqNum) && freqNum > 0 && freqNum < 1000;
}

/**
 * Validates if a value is a valid latitude (-90 to 90)
 * @param lat - Latitude value to validate
 * @returns true if valid latitude
 */
export function isValidLatitude(lat: number): boolean {
  return typeof lat === "number" && lat >= -90 && lat <= 90;
}

/**
 * Validates if a value is a valid longitude (-180 to 180)
 * @param lon - Longitude value to validate
 * @returns true if valid longitude
 */
export function isValidLongitude(lon: number): boolean {
  return typeof lon === "number" && lon >= -180 && lon <= 180;
}

/**
 * Validates if coordinates are valid
 * @param lat - Latitude value
 * @param lon - Longitude value
 * @returns true if both coordinates are valid
 */
export function isValidCoordinates(lat: number, lon: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lon);
}

/**
 * Validates if a string matches a pattern (regex or string)
 * @param value - Value to validate
 * @param pattern - Regex or string pattern
 * @returns true if value matches pattern
 */
export function matches(value: string, pattern: RegExp | string): boolean {
  if (typeof pattern === "string") {
    return value === pattern;
  }
  return pattern.test(value);
}

/**
 * Validates if a number is within a range
 * @param value - Number to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns true if value is within range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Validates if a string length is within a range
 * @param value - String to validate
 * @param min - Minimum length
 * @param max - Maximum length
 * @returns true if length is within range
 */
export function isLengthInRange(
  value: string,
  min: number,
  max: number,
): boolean {
  return value.length >= min && value.length <= max;
}

/**
 * Validates if a value is a positive number
 * @param value - Value to validate
 * @returns true if positive number
 */
export function isPositive(value: number): boolean {
  return typeof value === "number" && value > 0;
}

/**
 * Validates if a value is a negative number
 * @param value - Value to validate
 * @returns true if negative number
 */
export function isNegative(value: number): boolean {
  return typeof value === "number" && value < 0;
}

/**
 * Validates if a value is zero
 * @param value - Value to validate
 * @returns true if zero
 */
export function isZero(value: number): boolean {
  return value === 0;
}

/**
 * Validates if a value is an integer
 * @param value - Value to validate
 * @returns true if integer
 */
export function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Validates if a string contains only alphanumeric characters
 * @param value - String to validate
 * @returns true if alphanumeric only
 */
export function isAlphanumeric(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value);
}

/**
 * Validates if a string contains only alphabetic characters
 * @param value - String to validate
 * @returns true if alphabetic only
 */
export function isAlphabetic(value: string): boolean {
  return /^[A-Za-z]+$/.test(value);
}

/**
 * Validates if a string contains only numeric characters
 * @param value - String to validate
 * @returns true if numeric only
 */
export function isNumeric(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

/**
 * Validates if a value is null or undefined
 * @param value - Value to validate
 * @returns true if null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Validates if a value is defined (not null or undefined)
 * @param value - Value to validate
 * @returns true if defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return !isNullOrUndefined(value);
}

/**
 * Validates if an array is empty
 * @param array - Array to validate
 * @returns true if array is empty
 */
export function isEmptyArray(array: unknown[]): boolean {
  return Array.isArray(array) && array.length === 0;
}

/**
 * Validates if an object is empty (has no own properties)
 * @param obj - Object to validate
 * @returns true if object is empty
 */
export function isEmptyObject(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * Validates if a string is empty or contains only whitespace
 * @param value - String to validate
 * @returns true if empty or whitespace only
 */
export function isEmptyString(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Type guard to check if value is a string
 * @param value - Value to check
 * @returns true if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Type guard to check if value is a number
 * @param value - Value to check
 * @returns true if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Type guard to check if value is a boolean
 * @param value - Value to check
 * @returns true if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Type guard to check if value is an object
 * @param value - Value to check
 * @returns true if value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if value is an array
 * @param value - Value to check
 * @returns true if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard to check if value is a function
 * @param value - Value to check
 * @returns true if value is a function
 */
export function isFunction(
  value: unknown,
): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

/**
 * Type guard to check if value is a Date object
 * @param value - Value to check
 * @returns true if value is a Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Validates if a required field has a value
 * @param value - Value to validate
 * @returns true if field has a value (not empty string, null, or undefined)
 */
export function isRequired(value: unknown): boolean {
  if (isNullOrUndefined(value)) return false;
  if (isString(value)) return !isEmptyString(value);
  if (isArray(value)) return !isEmptyArray(value);
  return true;
}

/**
 * Validates if a flight number is in valid format
 * Flight numbers are typically 2-3 letter airline code + 1-4 digit number
 * @param flight - Flight number to validate
 * @returns true if valid flight number format
 */
export function isValidFlightNumber(flight: string): boolean {
  return /^[A-Z]{2,3}[0-9]{1,4}[A-Z]?$/.test(flight.trim().toUpperCase());
}

/**
 * Validates if a tail number (registration) is in valid format
 * Varies by country but generally alphanumeric with hyphen
 * @param tail - Tail number to validate
 * @returns true if valid tail number format
 */
export function isValidTailNumber(tail: string): boolean {
  return /^[A-Z0-9-]{2,10}$/.test(tail.trim().toUpperCase());
}

/**
 * Validates if an airport code is valid (3 or 4 letters)
 * @param airport - Airport code to validate
 * @returns true if valid airport code format
 */
export function isValidAirportCode(airport: string): boolean {
  return /^[A-Z]{3,4}$/.test(airport.trim().toUpperCase());
}

/**
 * Sanitizes user input to prevent XSS attacks
 * @param input - User input to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Validates multiple conditions and returns first error message
 * @param validations - Array of validation functions with error messages
 * @returns Error message or null if all validations pass
 */
export function validateAll(
  validations: Array<{ isValid: boolean; message: string }>,
): string | null {
  for (const validation of validations) {
    if (!validation.isValid) {
      return validation.message;
    }
  }
  return null;
}

/**
 * Creates a validation function that checks if value meets minimum length
 * @param minLength - Minimum length required
 * @returns Validation function
 */
export function minLength(
  minLength: number,
): (value: string) => { isValid: boolean; message: string } {
  return (value: string) => ({
    isValid: value.length >= minLength,
    message: `Minimum length is ${minLength} characters`,
  });
}

/**
 * Creates a validation function that checks if value meets maximum length
 * @param maxLength - Maximum length allowed
 * @returns Validation function
 */
export function maxLength(
  maxLength: number,
): (value: string) => { isValid: boolean; message: string } {
  return (value: string) => ({
    isValid: value.length <= maxLength,
    message: `Maximum length is ${maxLength} characters`,
  });
}

/**
 * Creates a validation function that checks if value is required
 * @param message - Custom error message
 * @returns Validation function
 */
export function required(
  message = "This field is required",
): (value: unknown) => { isValid: boolean; message: string } {
  return (value: unknown) => ({
    isValid: isRequired(value),
    message,
  });
}
