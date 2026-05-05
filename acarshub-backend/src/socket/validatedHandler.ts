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
 * Validated socket handler wrapper (SEC-03)
 *
 * Wraps a handler function with zod-based input validation.  On invalid
 * input the wrapped handler is NOT invoked; instead a structured
 * `validation_error` event is emitted to the originating socket and a
 * warning is logged.  On valid input the parsed (and now strictly typed)
 * payload is forwarded to the handler.
 *
 * Why a wrapper rather than `if (!schema.safeParse(...).success) return`
 * inside each handler?  Because:
 *
 *   1. Centralising the parse/log/emit triple guarantees uniform behaviour
 *      across every validated event — every rejection logs the same
 *      structured fields and emits the same shape.
 *   2. The handler function body can stay focused on business logic and
 *      receive a fully-typed payload without any local `unknown` casts.
 *   3. A future addition of a metrics counter or rate-limit decorator only
 *      needs to be applied in one place.
 */

import { createLogger } from "../utils/logger.js";
import type { ValidatedEvent, ValidatedPayload } from "./schemas.js";
import { SocketSchemas } from "./schemas.js";
import type { TypedSocket } from "./types.js";

const logger = createLogger("socket-validation");

/**
 * Wrap `handler` with zod validation against the schema registered for
 * `event` in SocketSchemas.
 *
 * Returns a function with signature `(payload: unknown) => void` because
 * Socket.IO will deliver whatever the client sent; the wrapper enforces
 * that what reaches `handler` matches the schema.
 *
 * @param event   - the SocketEmitEvents key whose schema should be applied
 * @param socket  - the originating socket; used to emit `validation_error`
 * @param handler - the validated handler invoked with the parsed payload
 */
export function validatedHandler<E extends ValidatedEvent>(
  event: E,
  socket: TypedSocket,
  handler: (payload: ValidatedPayload<E>) => void | Promise<void>,
): (payload: unknown) => void {
  const schema = SocketSchemas[event];

  return (payload: unknown): void => {
    const result = schema.safeParse(payload);

    if (!result.success) {
      // zod 4: result.error.issues is the structured issue list.
      // Strip undefined-shaped entries down to the three fields the wire
      // contract documents (path, code, message) — extra zod metadata is
      // implementation detail and shouldn't leak to clients.
      const issues = result.error.issues.map((issue) => ({
        path: issue.path as Array<string | number>,
        code: issue.code,
        message: issue.message,
      }));

      // Build a one-line summary suitable for direct UI display.  Path is
      // joined with "." for object fields and "[i]" for array indices,
      // mirroring the conventional zod error formatting.
      const summary =
        issues.length === 1
          ? formatIssue(issues[0])
          : `${issues.length} validation errors (first: ${formatIssue(issues[0])})`;

      logger.warn("Rejected invalid socket payload", {
        socketId: socket.id,
        event,
        issues,
      });

      socket.emit("validation_error", {
        event,
        summary,
        issues,
      });

      return;
    }

    // The cast is sound: result.data is ValidatedPayload<E> by zod's
    // inference, but TS cannot narrow through the generic dispatch.
    void handler(result.data as ValidatedPayload<E>);
  };
}

/**
 * Format a single zod issue as `path: message` for the summary line.
 * Empty paths (root-level rejections like "expected object, received
 * string") collapse to just the message.
 */
function formatIssue(issue: {
  path: Array<string | number>;
  message: string;
}): string {
  if (issue.path.length === 0) {
    return issue.message;
  }
  const path = issue.path
    .map((segment, i) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }
      return i === 0 ? segment : `.${segment}`;
    })
    .join("");
  return `${path}: ${issue.message}`;
}
