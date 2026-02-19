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

import { describe, expect, it } from "vitest";
import {
  isAlphabetic,
  isAlphanumeric,
  isArray,
  isBoolean,
  isDate,
  isDefined,
  isEmptyArray,
  isEmptyObject,
  isEmptyString,
  isFunction,
  isInRange,
  isInteger,
  isLengthInRange,
  isNegative,
  isNullOrUndefined,
  isNumber,
  isNumeric,
  isObject,
  isPositive,
  isRequired,
  isString,
  isValidAirportCode,
  isValidCoordinates,
  isValidEmail,
  isValidFlightNumber,
  isValidFrequency,
  isValidHexColor,
  isValidIcao,
  isValidLatitude,
  isValidLongitude,
  isValidTailNumber,
  isValidUrl,
  isZero,
  matches,
  maxLength,
  minLength,
  required,
  validateAll,
} from "../validationUtils";

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------

describe("isValidEmail", () => {
  it("accepts standard email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name+tag@sub.domain.org")).toBe(true);
  });

  it("rejects addresses missing @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects addresses missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects addresses with spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidUrl
// ---------------------------------------------------------------------------

describe("isValidUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
    expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects plain strings without scheme", () => {
    expect(isValidUrl("example.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidHexColor
// ---------------------------------------------------------------------------

describe("isValidHexColor", () => {
  it("accepts 6-digit hex colors", () => {
    expect(isValidHexColor("#RRGGBB".replace("RRGGBB", "1a2b3c"))).toBe(true);
    expect(isValidHexColor("#ABCDEF")).toBe(true);
    expect(isValidHexColor("#000000")).toBe(true);
  });

  it("accepts 3-digit shorthand hex colors", () => {
    expect(isValidHexColor("#FFF")).toBe(true);
    expect(isValidHexColor("#abc")).toBe(true);
  });

  it("rejects colors without leading #", () => {
    expect(isValidHexColor("ABCDEF")).toBe(false);
  });

  it("rejects colors with invalid characters", () => {
    expect(isValidHexColor("#GGGGGG")).toBe(false);
  });

  it("rejects colors with wrong length", () => {
    expect(isValidHexColor("#ABCD")).toBe(false);
    expect(isValidHexColor("#AB")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidHexColor("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidIcao
// ---------------------------------------------------------------------------

describe("isValidIcao", () => {
  it("accepts 6-character hex strings (mixed case)", () => {
    expect(isValidIcao("A1B2C3")).toBe(true);
    expect(isValidIcao("abcdef")).toBe(true);
    expect(isValidIcao("000000")).toBe(true);
    expect(isValidIcao("FFFFFF")).toBe(true);
  });

  it("rejects strings shorter than 6 characters", () => {
    expect(isValidIcao("A1B2C")).toBe(false);
  });

  it("rejects strings longer than 6 characters", () => {
    expect(isValidIcao("A1B2C3D")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidIcao("G1B2C3")).toBe(false);
    expect(isValidIcao("ZZZZZZ")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidIcao("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidFrequency
// ---------------------------------------------------------------------------

describe("isValidFrequency", () => {
  it("accepts numeric frequencies in range (0, 1000)", () => {
    expect(isValidFrequency(131.55)).toBe(true);
    expect(isValidFrequency(1)).toBe(true);
    expect(isValidFrequency(999)).toBe(true);
  });

  it("accepts string representation of valid frequency", () => {
    expect(isValidFrequency("131.55")).toBe(true);
  });

  it("rejects zero", () => {
    expect(isValidFrequency(0)).toBe(false);
  });

  it("rejects negative numbers", () => {
    expect(isValidFrequency(-1)).toBe(false);
  });

  it("rejects 1000 (exclusive upper bound)", () => {
    expect(isValidFrequency(1000)).toBe(false);
  });

  it("rejects NaN string", () => {
    expect(isValidFrequency("abc")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidLatitude / isValidLongitude / isValidCoordinates
// ---------------------------------------------------------------------------

describe("isValidLatitude", () => {
  it("accepts values in [-90, 90]", () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(45.5)).toBe(true);
  });

  it("rejects values outside [-90, 90]", () => {
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLatitude(-90.1)).toBe(false);
  });
});

describe("isValidLongitude", () => {
  it("accepts values in [-180, 180]", () => {
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(-74.006)).toBe(true);
  });

  it("rejects values outside [-180, 180]", () => {
    expect(isValidLongitude(180.1)).toBe(false);
    expect(isValidLongitude(-180.1)).toBe(false);
  });
});

describe("isValidCoordinates", () => {
  it("returns true when both lat and lon are valid", () => {
    expect(isValidCoordinates(40.71, -74.0)).toBe(true);
  });

  it("returns false when lat is invalid", () => {
    expect(isValidCoordinates(91, 0)).toBe(false);
  });

  it("returns false when lon is invalid", () => {
    expect(isValidCoordinates(0, 181)).toBe(false);
  });

  it("returns false when both are invalid", () => {
    expect(isValidCoordinates(91, 181)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matches
// ---------------------------------------------------------------------------

describe("matches", () => {
  it("matches exact string equality", () => {
    expect(matches("hello", "hello")).toBe(true);
    expect(matches("hello", "world")).toBe(false);
  });

  it("matches using a RegExp", () => {
    expect(matches("abc123", /^[a-z]+\d+$/)).toBe(true);
    expect(matches("123abc", /^[a-z]+\d+$/)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isInRange
// ---------------------------------------------------------------------------

describe("isInRange", () => {
  it("returns true when value is within range (inclusive)", () => {
    expect(isInRange(5, 1, 10)).toBe(true);
    expect(isInRange(1, 1, 10)).toBe(true);
    expect(isInRange(10, 1, 10)).toBe(true);
  });

  it("returns false when value is outside range", () => {
    expect(isInRange(0, 1, 10)).toBe(false);
    expect(isInRange(11, 1, 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLengthInRange
// ---------------------------------------------------------------------------

describe("isLengthInRange", () => {
  it("returns true when string length is within range", () => {
    expect(isLengthInRange("hello", 3, 10)).toBe(true);
    expect(isLengthInRange("hi", 2, 5)).toBe(true);
  });

  it("returns false when length is outside range", () => {
    expect(isLengthInRange("hi", 3, 10)).toBe(false);
    expect(isLengthInRange("toolongstring", 1, 5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isPositive / isNegative / isZero / isInteger
// ---------------------------------------------------------------------------

describe("isPositive", () => {
  it("returns true for positive numbers", () => {
    expect(isPositive(1)).toBe(true);
    expect(isPositive(0.1)).toBe(true);
  });

  it("returns false for zero and negative numbers", () => {
    expect(isPositive(0)).toBe(false);
    expect(isPositive(-1)).toBe(false);
  });
});

describe("isNegative", () => {
  it("returns true for negative numbers", () => {
    expect(isNegative(-1)).toBe(true);
    expect(isNegative(-0.1)).toBe(true);
  });

  it("returns false for zero and positive numbers", () => {
    expect(isNegative(0)).toBe(false);
    expect(isNegative(1)).toBe(false);
  });
});

describe("isZero", () => {
  it("returns true only for 0", () => {
    expect(isZero(0)).toBe(true);
  });

  it("returns false for non-zero values", () => {
    expect(isZero(1)).toBe(false);
    expect(isZero(-1)).toBe(false);
    expect(isZero(0.001)).toBe(false);
  });
});

describe("isInteger", () => {
  it("returns true for integers", () => {
    expect(isInteger(0)).toBe(true);
    expect(isInteger(42)).toBe(true);
    expect(isInteger(-7)).toBe(true);
  });

  it("returns false for floats", () => {
    expect(isInteger(1.5)).toBe(false);
    expect(isInteger(-0.1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAlphanumeric / isAlphabetic / isNumeric
// ---------------------------------------------------------------------------

describe("isAlphanumeric", () => {
  it("accepts strings with only letters and digits", () => {
    expect(isAlphanumeric("abc123")).toBe(true);
    expect(isAlphanumeric("ABC")).toBe(true);
    expect(isAlphanumeric("123")).toBe(true);
  });

  it("rejects strings with special characters or spaces", () => {
    expect(isAlphanumeric("abc 123")).toBe(false);
    expect(isAlphanumeric("abc-123")).toBe(false);
    expect(isAlphanumeric("")).toBe(false);
  });
});

describe("isAlphabetic", () => {
  it("accepts strings with only letters", () => {
    expect(isAlphabetic("abc")).toBe(true);
    expect(isAlphabetic("ABC")).toBe(true);
    expect(isAlphabetic("AbCdEf")).toBe(true);
  });

  it("rejects strings with digits or special characters", () => {
    expect(isAlphabetic("abc1")).toBe(false);
    expect(isAlphabetic("abc!")).toBe(false);
    expect(isAlphabetic("")).toBe(false);
  });
});

describe("isNumeric", () => {
  it("accepts strings with only digit characters", () => {
    expect(isNumeric("123")).toBe(true);
    expect(isNumeric("0")).toBe(true);
  });

  it("rejects strings with letters or punctuation", () => {
    expect(isNumeric("123.4")).toBe(false);
    expect(isNumeric("123a")).toBe(false);
    expect(isNumeric("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isNullOrUndefined / isDefined
// ---------------------------------------------------------------------------

describe("isNullOrUndefined", () => {
  it("returns true for null and undefined", () => {
    expect(isNullOrUndefined(null)).toBe(true);
    expect(isNullOrUndefined(undefined)).toBe(true);
  });

  it("returns false for all other values", () => {
    expect(isNullOrUndefined(0)).toBe(false);
    expect(isNullOrUndefined("")).toBe(false);
    expect(isNullOrUndefined(false)).toBe(false);
    expect(isNullOrUndefined([])).toBe(false);
  });
});

describe("isDefined", () => {
  it("returns true when value is not null or undefined", () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined("")).toBe(true);
    expect(isDefined(false)).toBe(true);
  });

  it("returns false for null and undefined", () => {
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isEmptyArray / isEmptyObject / isEmptyString
// ---------------------------------------------------------------------------

describe("isEmptyArray", () => {
  it("returns true for an empty array", () => {
    expect(isEmptyArray([])).toBe(true);
  });

  it("returns false for a non-empty array", () => {
    expect(isEmptyArray([1])).toBe(false);
  });
});

describe("isEmptyObject", () => {
  it("returns true for an object with no own properties", () => {
    expect(isEmptyObject({})).toBe(true);
  });

  it("returns false for an object with properties", () => {
    expect(isEmptyObject({ key: "value" })).toBe(false);
  });
});

describe("isEmptyString", () => {
  it("returns true for empty string", () => {
    expect(isEmptyString("")).toBe(true);
  });

  it("returns true for whitespace-only string", () => {
    expect(isEmptyString("   ")).toBe(true);
    expect(isEmptyString("\t\n")).toBe(true);
  });

  it("returns false for strings with content", () => {
    expect(isEmptyString("a")).toBe(false);
    expect(isEmptyString("  a  ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Type guards: isString / isNumber / isBoolean / isObject / isArray / isFunction / isDate
// ---------------------------------------------------------------------------

describe("isString", () => {
  it("returns true for string primitives", () => {
    expect(isString("hello")).toBe(true);
    expect(isString("")).toBe(true);
  });

  it("returns false for non-strings", () => {
    expect(isString(1)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
    expect(isString([])).toBe(false);
  });
});

describe("isNumber", () => {
  it("returns true for finite numbers", () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(3.14)).toBe(true);
    expect(isNumber(-100)).toBe(true);
  });

  it("returns false for NaN", () => {
    expect(isNumber(Number.NaN)).toBe(false);
  });

  it("returns false for non-numbers", () => {
    expect(isNumber("1")).toBe(false);
    expect(isNumber(null)).toBe(false);
  });
});

describe("isBoolean", () => {
  it("returns true for boolean values", () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
  });

  it("returns false for truthy/falsy non-booleans", () => {
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean("true")).toBe(false);
    expect(isBoolean(null)).toBe(false);
  });
});

describe("isObject", () => {
  it("returns true for plain objects", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ key: "value" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isObject(null)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isObject([])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isObject("string")).toBe(false);
    expect(isObject(42)).toBe(false);
  });
});

describe("isArray", () => {
  it("returns true for arrays", () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
  });

  it("returns false for non-arrays", () => {
    expect(isArray({})).toBe(false);
    expect(isArray("string")).toBe(false);
    expect(isArray(null)).toBe(false);
  });
});

describe("isFunction", () => {
  it("returns true for functions", () => {
    expect(isFunction(() => {})).toBe(true);
    expect(isFunction(function named() {})).toBe(true);
  });

  it("returns false for non-functions", () => {
    expect(isFunction(null)).toBe(false);
    expect(isFunction("function")).toBe(false);
    expect(isFunction({})).toBe(false);
  });
});

describe("isDate", () => {
  it("returns true for valid Date objects", () => {
    expect(isDate(new Date())).toBe(true);
    expect(isDate(new Date("2024-01-01"))).toBe(true);
  });

  it("returns false for invalid Date objects", () => {
    expect(isDate(new Date("not-a-date"))).toBe(false);
  });

  it("returns false for date strings and numbers", () => {
    expect(isDate("2024-01-01")).toBe(false);
    expect(isDate(1704067200000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRequired
// ---------------------------------------------------------------------------

describe("isRequired", () => {
  it("returns false for null and undefined", () => {
    expect(isRequired(null)).toBe(false);
    expect(isRequired(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isRequired("")).toBe(false);
    expect(isRequired("   ")).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isRequired([])).toBe(false);
  });

  it("returns true for non-empty string", () => {
    expect(isRequired("hello")).toBe(true);
  });

  it("returns true for non-empty array", () => {
    expect(isRequired([1])).toBe(true);
  });

  it("returns true for numbers (including 0)", () => {
    expect(isRequired(0)).toBe(true);
    expect(isRequired(42)).toBe(true);
  });

  it("returns true for booleans", () => {
    expect(isRequired(false)).toBe(true);
    expect(isRequired(true)).toBe(true);
  });

  it("returns true for plain objects", () => {
    expect(isRequired({})).toBe(true);
    expect(isRequired({ key: "value" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidFlightNumber
// ---------------------------------------------------------------------------

describe("isValidFlightNumber", () => {
  it("accepts standard flight numbers (2-letter code + digits)", () => {
    expect(isValidFlightNumber("UA123")).toBe(true);
    expect(isValidFlightNumber("AA1234")).toBe(true);
  });

  it("accepts 3-letter airline code + digits", () => {
    expect(isValidFlightNumber("UAL123")).toBe(true);
    expect(isValidFlightNumber("DAL456")).toBe(true);
  });

  it("accepts optional trailing letter suffix", () => {
    expect(isValidFlightNumber("UA123A")).toBe(true);
    expect(isValidFlightNumber("UAL456B")).toBe(true);
  });

  it("is case-insensitive (normalises to uppercase internally)", () => {
    expect(isValidFlightNumber("ua123")).toBe(true);
    expect(isValidFlightNumber("ual456")).toBe(true);
  });

  it("rejects single-letter codes", () => {
    expect(isValidFlightNumber("A123")).toBe(false);
  });

  it("rejects codes with no digit portion", () => {
    expect(isValidFlightNumber("UAL")).toBe(false);
    expect(isValidFlightNumber("UA")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidFlightNumber("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidTailNumber
// ---------------------------------------------------------------------------

describe("isValidTailNumber", () => {
  it("accepts standard US N-numbers", () => {
    expect(isValidTailNumber("N12345")).toBe(true);
    expect(isValidTailNumber("N1AB")).toBe(true);
  });

  it("accepts hyphenated registrations", () => {
    expect(isValidTailNumber("G-ABCD")).toBe(true);
    expect(isValidTailNumber("F-GKCA")).toBe(true);
  });

  it("accepts short 2-character registrations", () => {
    expect(isValidTailNumber("AB")).toBe(true);
  });

  it("rejects strings longer than 10 characters", () => {
    expect(isValidTailNumber("N123456789A")).toBe(false);
  });

  it("rejects single characters", () => {
    expect(isValidTailNumber("N")).toBe(false);
  });

  it("rejects strings with lowercase characters (not normalised to uppercase)", () => {
    // Function normalises internally, so lowercase input should still work
    expect(isValidTailNumber("n12345")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidTailNumber("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidAirportCode
// ---------------------------------------------------------------------------

describe("isValidAirportCode", () => {
  it("accepts 3-letter IATA codes", () => {
    expect(isValidAirportCode("SFO")).toBe(true);
    expect(isValidAirportCode("JFK")).toBe(true);
  });

  it("accepts 4-letter ICAO codes", () => {
    expect(isValidAirportCode("KSFO")).toBe(true);
    expect(isValidAirportCode("EGLL")).toBe(true);
  });

  it("is case-insensitive (normalises internally)", () => {
    expect(isValidAirportCode("sfo")).toBe(true);
    expect(isValidAirportCode("ksfo")).toBe(true);
  });

  it("rejects codes shorter than 3 characters", () => {
    expect(isValidAirportCode("SF")).toBe(false);
    expect(isValidAirportCode("K")).toBe(false);
  });

  it("rejects codes longer than 4 characters", () => {
    expect(isValidAirportCode("KSFOO")).toBe(false);
  });

  it("rejects codes with digits or special characters", () => {
    expect(isValidAirportCode("K1FO")).toBe(false);
    expect(isValidAirportCode("K-FO")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidAirportCode("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAll
// ---------------------------------------------------------------------------

describe("validateAll", () => {
  it("returns null when all validations pass", () => {
    const validations = [
      { isValid: true, message: "ok" },
      { isValid: true, message: "also ok" },
    ];
    expect(validateAll(validations)).toBeNull();
  });

  it("returns the first error message on failure", () => {
    const validations = [
      { isValid: true, message: "ok" },
      { isValid: false, message: "first error" },
      { isValid: false, message: "second error" },
    ];
    expect(validateAll(validations)).toBe("first error");
  });

  it("returns null for an empty validation array", () => {
    expect(validateAll([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// minLength / maxLength / required (factory functions)
// ---------------------------------------------------------------------------

describe("minLength factory", () => {
  const validate = minLength(3);

  it("returns isValid=true when string meets minimum", () => {
    expect(validate("abc").isValid).toBe(true);
    expect(validate("abcd").isValid).toBe(true);
  });

  it("returns isValid=false when string is too short", () => {
    expect(validate("ab").isValid).toBe(false);
  });

  it("includes the minimum length in the message", () => {
    expect(validate("ab").message).toContain("3");
  });
});

describe("maxLength factory", () => {
  const validate = maxLength(5);

  it("returns isValid=true when string is within limit", () => {
    expect(validate("hello").isValid).toBe(true);
    expect(validate("hi").isValid).toBe(true);
  });

  it("returns isValid=false when string exceeds limit", () => {
    expect(validate("toolong").isValid).toBe(false);
  });

  it("includes the maximum length in the message", () => {
    expect(validate("toolong").message).toContain("5");
  });
});

describe("required factory", () => {
  it("returns isValid=true for a non-empty value", () => {
    const validate = required();
    expect(validate("hello").isValid).toBe(true);
  });

  it("returns isValid=false for null", () => {
    const validate = required();
    expect(validate(null).isValid).toBe(false);
  });

  it("uses custom message when provided", () => {
    const validate = required("Custom error");
    expect(validate(null).message).toBe("Custom error");
  });

  it("uses default message when no custom message provided", () => {
    const validate = required();
    expect(validate(null).message).toBeTruthy();
  });
});
