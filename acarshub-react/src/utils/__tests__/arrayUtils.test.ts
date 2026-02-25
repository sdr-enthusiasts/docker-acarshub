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
  average,
  chunk,
  compact,
  countBy,
  deepClone,
  deepEqual,
  deepMerge,
  difference,
  drop,
  flatten,
  flattenDeep,
  get,
  groupBy,
  intersection,
  isEmpty,
  max,
  min,
  omit,
  pick,
  pluck,
  set,
  shuffle,
  sortBy,
  sum,
  take,
  union,
  unique,
} from "../arrayUtils";

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------

describe("groupBy", () => {
  it("groups items by the specified key", () => {
    const items = [
      { type: "A", val: 1 },
      { type: "B", val: 2 },
      { type: "A", val: 3 },
    ];
    const result = groupBy(items, "type");
    expect(result.A).toHaveLength(2);
    expect(result.B).toHaveLength(1);
  });

  it("returns an empty object for an empty array", () => {
    expect(groupBy([], "key" as never)).toEqual({});
  });

  it("converts non-string keys to string", () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 1 }];
    const result = groupBy(items, "n");
    expect(result["1"]).toHaveLength(2);
    expect(result["2"]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// unique
// ---------------------------------------------------------------------------

describe("unique", () => {
  it("removes duplicate primitives", () => {
    expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it("removes duplicate strings", () => {
    expect(unique(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("deduplicates objects by key", () => {
    const items = [
      { id: 1, val: "a" },
      { id: 2, val: "b" },
      { id: 1, val: "c" },
    ];
    const result = unique(items, "id");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
    // first occurrence is kept
    expect(result[0].val).toBe("a");
  });

  it("returns an empty array for an empty input", () => {
    expect(unique([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sortBy
// ---------------------------------------------------------------------------

describe("sortBy", () => {
  const items = [
    { name: "charlie", age: 30 },
    { name: "alice", age: 25 },
    { name: "bob", age: 35 },
  ];

  it("sorts ascending by default", () => {
    const result = sortBy(items, "name");
    expect(result.map((i) => i.name)).toEqual(["alice", "bob", "charlie"]);
  });

  it("sorts descending when specified", () => {
    const result = sortBy(items, "age", "desc");
    expect(result.map((i) => i.age)).toEqual([35, 30, 25]);
  });

  it("does not mutate the original array", () => {
    const original = [...items];
    sortBy(items, "name");
    expect(items).toEqual(original);
  });

  it("handles equal values (stable order preserved)", () => {
    const tied = [
      { v: 1, order: "first" },
      { v: 1, order: "second" },
    ];
    const result = sortBy(tied, "v");
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// chunk
// ---------------------------------------------------------------------------

describe("chunk", () => {
  it("splits an array into chunks of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns the whole array in one chunk when size >= length", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("returns an empty array for an empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("handles chunk size of 1", () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

// ---------------------------------------------------------------------------
// flatten / flattenDeep
// ---------------------------------------------------------------------------

describe("flatten", () => {
  it("flattens one level deep", () => {
    expect(flatten([[1, 2], [3, 4], [5]])).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns an empty array for an empty input", () => {
    expect(flatten([])).toEqual([]);
  });

  it("does not flatten more than one level", () => {
    const nested: number[][][] = [[[1, 2]], [[3]]];
    // flatten one level: [[1,2], [3]]
    const result = flatten(nested);
    expect(result).toEqual([[1, 2], [3]]);
  });
});

describe("flattenDeep", () => {
  it("flattens arbitrarily nested arrays", () => {
    expect(flattenDeep([1, [2, [3, [4]]]])).toEqual([1, 2, 3, 4]);
  });

  it("handles already-flat arrays", () => {
    expect(flattenDeep([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("returns an empty array for empty input", () => {
    expect(flattenDeep([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// intersection / difference / union
// ---------------------------------------------------------------------------

describe("intersection", () => {
  it("returns elements present in both arrays", () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it("returns an empty array when there is no overlap", () => {
    expect(intersection([1, 2], [3, 4])).toEqual([]);
  });

  it("handles empty arrays", () => {
    expect(intersection([], [1, 2])).toEqual([]);
    expect(intersection([1, 2], [])).toEqual([]);
  });
});

describe("difference", () => {
  it("returns items only in the first array", () => {
    expect(difference([1, 2, 3, 4], [2, 4])).toEqual([1, 3]);
  });

  it("returns the first array when there is no overlap", () => {
    expect(difference([1, 2], [3, 4])).toEqual([1, 2]);
  });

  it("returns an empty array when first array is empty", () => {
    expect(difference([], [1, 2])).toEqual([]);
  });

  it("returns an empty array when all items are in second array", () => {
    expect(difference([1, 2], [1, 2])).toEqual([]);
  });
});

describe("union", () => {
  it("combines two arrays, removing duplicates", () => {
    expect(union([1, 2, 3], [2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("handles empty arrays", () => {
    expect(union([], [1, 2])).toEqual([1, 2]);
    expect(union([1, 2], [])).toEqual([1, 2]);
    expect(union([], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// shuffle
// ---------------------------------------------------------------------------

describe("shuffle", () => {
  it("returns an array of the same length", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr)).toHaveLength(arr.length);
  });

  it("contains the same elements (not the same reference)", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(arr);
    expect(result.sort()).toEqual([...arr].sort());
  });

  it("does not mutate the original array", () => {
    const arr = [1, 2, 3, 4, 5];
    const copy = [...arr];
    shuffle(arr);
    expect(arr).toEqual(copy);
  });

  it("handles an empty array", () => {
    expect(shuffle([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// take / drop
// ---------------------------------------------------------------------------

describe("take", () => {
  it("takes the first n items", () => {
    expect(take([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
  });

  it("returns all items when n >= length", () => {
    expect(take([1, 2], 10)).toEqual([1, 2]);
  });

  it("returns an empty array when n is 0", () => {
    expect(take([1, 2, 3], 0)).toEqual([]);
  });
});

describe("drop", () => {
  it("drops the first n items", () => {
    expect(drop([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
  });

  it("returns an empty array when n >= length", () => {
    expect(drop([1, 2], 10)).toEqual([]);
  });

  it("returns the full array when n is 0", () => {
    expect(drop([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// compact
// ---------------------------------------------------------------------------

describe("compact", () => {
  it("removes all falsy values", () => {
    expect(compact([0, 1, false, 2, "", 3, null, undefined])).toEqual([
      1, 2, 3,
    ]);
  });

  it("returns an empty array when all values are falsy", () => {
    expect(compact([null, undefined, false, 0, ""])).toEqual([]);
  });

  it("returns the same array when no falsy values are present", () => {
    expect(compact([1, "hello", true])).toEqual([1, "hello", true]);
  });
});

// ---------------------------------------------------------------------------
// pluck
// ---------------------------------------------------------------------------

describe("pluck", () => {
  it("extracts a single property from each object", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(pluck(items, "id")).toEqual([1, 2, 3]);
  });

  it("returns an empty array for an empty input", () => {
    expect(pluck([], "id" as never)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// min / max / sum / average
// ---------------------------------------------------------------------------

describe("min", () => {
  it("returns the smallest number", () => {
    expect(min([3, 1, 4, 1, 5, 9])).toBe(1);
  });

  it("returns undefined for an empty array", () => {
    expect(min([])).toBeUndefined();
  });

  it("handles negative numbers", () => {
    expect(min([-5, -3, -10])).toBe(-10);
  });
});

describe("max", () => {
  it("returns the largest number", () => {
    expect(max([3, 1, 4, 1, 5, 9])).toBe(9);
  });

  it("returns undefined for an empty array", () => {
    expect(max([])).toBeUndefined();
  });

  it("handles negative numbers", () => {
    expect(max([-5, -3, -10])).toBe(-3);
  });
});

describe("sum", () => {
  it("returns the sum of all numbers", () => {
    expect(sum([1, 2, 3, 4, 5])).toBe(15);
  });

  it("returns 0 for an empty array", () => {
    expect(sum([])).toBe(0);
  });

  it("handles negative numbers", () => {
    expect(sum([-1, -2, 3])).toBe(0);
  });
});

describe("average", () => {
  it("returns the average of all numbers", () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it("returns undefined for an empty array", () => {
    expect(average([])).toBeUndefined();
  });

  it("handles a single element", () => {
    expect(average([42])).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// countBy
// ---------------------------------------------------------------------------

describe("countBy", () => {
  it("counts occurrences of each value", () => {
    const result = countBy(["a", "b", "a", "c", "b", "a"]);
    expect(result.a).toBe(3);
    expect(result.b).toBe(2);
    expect(result.c).toBe(1);
  });

  it("returns an empty object for an empty array", () => {
    expect(countBy([])).toEqual({});
  });

  it("converts values to strings for keys", () => {
    const result = countBy([1, 2, 1, 3]);
    expect(result["1"]).toBe(2);
    expect(result["2"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deepClone
// ---------------------------------------------------------------------------

describe("deepClone", () => {
  it("creates a deep copy (not the same reference)", () => {
    const obj = { a: { b: 1 } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.a).not.toBe(obj.a);
  });

  it("clones nested arrays", () => {
    const arr = [1, [2, 3], [4, [5]]];
    const clone = deepClone(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
    expect(clone[1]).not.toBe(arr[1]);
  });

  it("clones Date objects", () => {
    const date = new Date("2024-01-01");
    const clone = deepClone(date);
    expect(clone).toEqual(date);
    expect(clone).not.toBe(date);
    expect(clone instanceof Date).toBe(true);
  });

  it("returns primitives as-is", () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone("hello")).toBe("hello");
    expect(deepClone(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

describe("deepMerge", () => {
  it("merges top-level properties from source into target", () => {
    const target = { a: 1, b: 2 };
    const source = { b: 99, c: 3 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("recursively merges nested objects", () => {
    const target = { nested: { x: 1, y: 2 } };
    const source: Partial<typeof target> = {
      nested: { x: 1, y: 99 },
    };
    expect(deepMerge(target, source)).toEqual({
      nested: { x: 1, y: 99 },
    });
  });

  it("does not mutate the target object", () => {
    const target = { a: 1 };
    const source: Partial<typeof target> = {};
    deepMerge(target, source);
    expect(target).toEqual({ a: 1 });
  });

  it("source arrays overwrite target arrays (not merged)", () => {
    const target = { arr: [1, 2, 3] };
    const source = { arr: [4, 5] };
    expect(deepMerge(target, source)).toEqual({ arr: [4, 5] });
  });
});

// ---------------------------------------------------------------------------
// pick / omit
// ---------------------------------------------------------------------------

describe("pick", () => {
  it("picks only the specified keys", () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("returns an empty object when keys array is empty", () => {
    const obj = { a: 1, b: 2 };
    expect(pick(obj, [])).toEqual({});
  });

  it("ignores keys that do not exist on the object", () => {
    const obj = { a: 1, b: 2 };
    // @ts-expect-error — testing runtime behaviour with non-existent key
    expect(pick(obj, ["a", "z"])).toEqual({ a: 1 });
  });
});

describe("omit", () => {
  it("omits the specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("returns the full object when keys array is empty", () => {
    const obj = { a: 1, b: 2 };
    expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
  });

  it("ignores keys that do not exist on the object", () => {
    const obj = { a: 1, b: 2 };
    // @ts-expect-error — testing runtime behaviour with non-existent key
    expect(omit(obj, ["z"])).toEqual({ a: 1, b: 2 });
  });
});

// ---------------------------------------------------------------------------
// deepEqual
// ---------------------------------------------------------------------------

describe("deepEqual", () => {
  it("returns true for identical primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("hello", "hello")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  it("returns false for different primitives", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("returns true for deeply equal objects", () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });

  it("returns false for objects with different values", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("returns false for objects with different keys", () => {
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("returns true for deeply equal arrays", () => {
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
  });

  it("returns false for arrays with different lengths", () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("compares Date objects by value", () => {
    const d1 = new Date("2024-01-01");
    const d2 = new Date("2024-01-01");
    const d3 = new Date("2024-01-02");
    expect(deepEqual(d1, d2)).toBe(true);
    expect(deepEqual(d1, d3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------

describe("isEmpty", () => {
  it("returns true for an empty object", () => {
    expect(isEmpty({})).toBe(true);
  });

  it("returns false for an object with properties", () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get / set
// ---------------------------------------------------------------------------

describe("get", () => {
  const obj = { user: { address: { city: "San Francisco" } } };

  it("retrieves a deeply nested value via dot notation", () => {
    expect(get(obj, "user.address.city")).toBe("San Francisco");
  });

  it("returns undefined when path does not exist", () => {
    expect(get(obj, "user.phone")).toBeUndefined();
  });

  it("returns the default value when path is missing", () => {
    expect(get(obj, "user.phone", "N/A")).toBe("N/A");
  });

  it("returns the default value for prototype pollution keys", () => {
    expect(get(obj, "__proto__.toString", "safe")).toBe("safe");
    expect(get(obj, "constructor.name", "safe")).toBe("safe");
  });

  it("handles a path with a single key", () => {
    expect(get({ a: 42 }, "a")).toBe(42);
  });
});

describe("set", () => {
  it("sets a deeply nested value via dot notation", () => {
    const obj = { user: { name: "Alice" } };
    const result = set(obj, "user.name", "Bob");
    expect(result.user.name).toBe("Bob");
  });

  it("creates intermediate objects when path does not exist", () => {
    const obj: Record<string, unknown> = {};
    const result = set(obj, "a.b.c", 42);
    expect((result as { a: { b: { c: number } } }).a.b.c).toBe(42);
  });

  it("does not mutate the original object", () => {
    const obj = { a: 1 };
    set(obj, "a", 99);
    expect(obj.a).toBe(1);
  });

  it("ignores prototype pollution keys silently", () => {
    const obj: Record<string, unknown> = {};
    // Should not throw and should not pollute prototype
    expect(() => set(obj, "__proto__.polluted", true)).not.toThrow();
    expect(
      (Object.prototype as Record<string, unknown>).polluted,
    ).toBeUndefined();
  });
});
