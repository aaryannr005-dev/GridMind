import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyTheme, loadTheme } from "./theme";

applyTheme(loadTheme());

const root = document.getElementById("root");
if (!root) throw new Error("Missing renderer root element");

createRoot(root).render(
  <React.StrictMode>
    <>
      <App />
      <div
        style={{
          position: "fixed",
          right: 14,
          bottom: 12,
          zIndex: 20,
          padding: "7px 10px",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-m)",
          color: "var(--muted)",
          background: "var(--panel)",
          boxShadow: "var(--shadow)",
          fontSize: 11,
          pointerEvents: "none",
        }}
      >
        Browser UI preview · Python engine not connected
      </div>
    </>
  </React.StrictMode>,
);
