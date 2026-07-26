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

// ----------------------------------------------------------------------------
// GOD-07: extracted from store/useAppStore.ts. Alert term configuration and
// aggregate alert stats (alertCount, alertTermData). Note: the actual alert
// *messages* live in messagesSlice.ts's alertMessageGroups — this slice is
// configuration/stats only.
// ----------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import type { AlertTerm, Terms } from "../../types";
import { storeLogger } from "../../utils/logger";

export interface AlertsSlice {
  // Alert configuration
  alertTerms: Terms;
  setAlertTerms: (terms: Terms) => void;
  alertCount: number;
  setAlertCount: (count: number) => void;

  // Statistics data
  alertTermData: AlertTerm | null;
  setAlertTermData: (data: AlertTerm) => void;
}

export const createAlertsSlice: StateCreator<
  AlertsSlice,
  [],
  [],
  AlertsSlice
> = (set) => ({
  alertTerms: { terms: [], ignore: [] },
  setAlertTerms: (terms) => {
    storeLogger.debug("Alert terms updated", {
      terms: terms.terms?.length || 0,
      ignore: terms.ignore?.length || 0,
    });
    set({ alertTerms: terms });
  },
  alertCount: 0,
  setAlertCount: (count) => {
    storeLogger.trace("Alert count updated", { count });
    set({ alertCount: count });
  },

  alertTermData: null,
  setAlertTermData: (data) => set({ alertTermData: data }),
});
