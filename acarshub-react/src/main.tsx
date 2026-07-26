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

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/main.scss";
import App from "./App.tsx";

// Shape of the React DevTools global hook that React inspects on the host
// console object to decide whether to print the "Download the React DevTools"
// message in development.  We only need to satisfy the property checks React
// itself performs; we are not implementing a real DevTools backend.
interface ReactDevToolsGlobalHook {
  checkDCE: () => void;
  supportsFiber: boolean;
  inject: () => void;
  onCommitFiberRoot: () => void;
  onCommitFiberUnmount: () => void;
}

// Augment the lib-dom Console interface with the optional hook field so we
// can assign it without a `noExplicitAny` waiver.  Marked optional because
// production builds never set it.
declare global {
  interface Console {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsGlobalHook;
  }
}

// Suppress React DevTools message in development
if (import.meta.env.DEV) {
  console.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    checkDCE: () => {},
    supportsFiber: true,
    inject: () => {},
    onCommitFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
  };
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
