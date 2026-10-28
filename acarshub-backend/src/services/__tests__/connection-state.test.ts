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

import { beforeEach, describe, expect, it } from "vitest";
import {
  getConnectionStatus,
  publishConnectionStatus,
  resetConnectionStatus,
} from "../connection-state.js";
import type { ConnectionStatus } from "../listener-types.js";

const allFalse: ConnectionStatus = {
  ACARS: false,
  VDLM2: false,
  HFDL: false,
  IMSL: false,
  IRDM: false,
  XNG: false,
};

describe("connection-state", () => {
  beforeEach(() => {
    resetConnectionStatus();
  });

  it("reports every type, including XNG, as disconnected before anything is published", () => {
    expect(getConnectionStatus()).toEqual(allFalse);
  });

  it("returns the published status", () => {
    publishConnectionStatus({ ...allFalse, ACARS: true, XNG: true });

    expect(getConnectionStatus()).toEqual({
      ...allFalse,
      ACARS: true,
      XNG: true,
    });
  });

  it("stores a copy, so mutating the published object does not change state", () => {
    const source: ConnectionStatus = { ...allFalse, VDLM2: true };
    publishConnectionStatus(source);

    source.VDLM2 = false;
    source.HFDL = true;

    expect(getConnectionStatus()).toEqual({ ...allFalse, VDLM2: true });
  });

  it("returns a copy, so mutating the result does not change state", () => {
    publishConnectionStatus({ ...allFalse, IRDM: true });

    const result = getConnectionStatus();
    result.IRDM = false;

    expect(getConnectionStatus().IRDM).toBe(true);
  });

  it("reset returns to the all-disconnected default", () => {
    publishConnectionStatus({
      ACARS: true,
      VDLM2: true,
      HFDL: true,
      IMSL: true,
      IRDM: true,
      XNG: true,
    });

    resetConnectionStatus();

    expect(getConnectionStatus()).toEqual(allFalse);
  });
});
