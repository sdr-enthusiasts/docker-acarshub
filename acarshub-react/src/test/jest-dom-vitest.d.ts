// Type-only bridge between @testing-library/jest-dom and Vitest 5.
//
// Vitest 5 changed `Assertion<T>` to `Assertion<R, T>` and dropped the
// `jest.Matchers` linkage Vitest 4 had, so neither the global
// `@testing-library/jest-dom` augmentation nor the shipped
// `@testing-library/jest-dom/vitest` one reaches Vitest's assertion type
// any more (the matchers still register and run at runtime -- only the
// types vanish). Extending `Matchers<R, T>`, Vitest 5's documented
// extension point, restores them.
//
// Remove once jest-dom ships Vitest 5 types:
// https://github.com/testing-library/jest-dom/issues/738
import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import type { ExpectStatic } from "vitest";

type AsymmetricMatcher = ReturnType<ExpectStatic["stringContaining"]>;

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<AsymmetricMatcher, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<
    AsymmetricMatcher,
    unknown
  > {}
}
