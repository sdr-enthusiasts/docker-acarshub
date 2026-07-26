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
 * Component-level accessibility assertion helper.
 *
 * Wraps `axe-core` (the same engine used by `e2e/accessibility.spec.ts`)
 * for use inside Vitest + React Testing Library suites. Component tests
 * call this helper after `render()` to catch WCAG 2.1 AA regressions at
 * unit-test speed — long before the Playwright a11y sweep runs.
 *
 * The plan section TEST-MISSING-A11Y originally proposed `vitest-axe`,
 * but that package is at 0.1.0 and stale. axe-core is already a direct
 * dependency (4.11.4), so this helper wires it in directly with zero
 * additional install surface.
 */

import axe, { type AxeResults, type RunOptions } from "axe-core";

/**
 * Default axe ruleset.
 *
 * - `wcag2a` / `wcag2aa` — WCAG 2.0 A + AA
 * - `wcag21a` / `wcag21aa` — WCAG 2.1 A + AA additions
 *
 * Mirrors the E2E sweep (`e2e/accessibility.spec.ts`) so unit-test
 * results are directly comparable. WCAG 2.2 AAA rules are intentionally
 * excluded — the project targets 2.1 AA per AGENTS.md.
 */
const DEFAULT_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Run axe against a DOM subtree and return the raw results.
 *
 * Prefer `expectNoA11yViolations()` for the common assertion case.
 * Use this when you need to inspect violations programmatically (e.g.
 * to assert a specific rule fires or to exclude an expected violation).
 */
export async function runAxe(
  container: Element,
  options: RunOptions = {},
): Promise<AxeResults> {
  return axe.run(container, {
    runOnly: { type: "tag", values: DEFAULT_TAGS },
    ...options,
  });
}

/**
 * Assert that a DOM subtree has zero WCAG 2.1 AA violations.
 *
 * On failure, throws with a human-readable summary listing each rule
 * id, the impact level, the help URL, and the failing node target —
 * sufficient to reproduce and fix without re-running the test.
 *
 * @example
 *   const { container } = render(<Toggle label="X" checked={false} onChange={() => {}} />);
 *   await expectNoA11yViolations(container);
 */
export async function expectNoA11yViolations(
  container: Element,
  options: RunOptions = {},
): Promise<void> {
  const results = await runAxe(container, options);
  if (results.violations.length === 0) {
    return;
  }

  const lines: string[] = [
    `axe-core found ${results.violations.length} accessibility violation(s):`,
  ];
  for (const v of results.violations) {
    lines.push(
      `  • [${v.impact ?? "unknown"}] ${v.id} — ${v.help} (${v.helpUrl})`,
    );
    for (const node of v.nodes) {
      lines.push(`      target: ${node.target.join(" ")}`);
      if (node.failureSummary) {
        for (const fs of node.failureSummary.split("\n")) {
          lines.push(`        ${fs}`);
        }
      }
    }
  }
  throw new Error(lines.join("\n"));
}
