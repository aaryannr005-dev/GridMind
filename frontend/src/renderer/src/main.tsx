import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyTheme, loadTheme } from "./theme";

// Apply the persisted theme before React renders so the first paint already
// carries the right tokens — no dark flash on boot, and no load-time color
// transitions for assistive tools to sample mid-flight.
applyTheme(loadTheme());

const root = document.getElementById("root");
if (!root) throw new Error("Missing renderer root element");

createRoot(root).render(
  <React.StrictMode><App /></React.StrictMode>,
);
