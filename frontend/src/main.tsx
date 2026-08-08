import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { initTheme } from "./store/theme";
import App from "./App";
import "./index.css";

// Apply the persisted theme before first paint so the correct dark/light class
// is on <html> for every page load — including pages that never mount the
// TopHeader (e.g. /companies switch-mode) where the class used to be lost on
// full navigation. Also avoids a flash of the wrong theme.
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
