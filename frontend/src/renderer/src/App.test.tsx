import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("GridMind desktop shell", () => {
  it("shows an honest empty home state without invented results", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /make every energy decision explainable/i })).toBeInTheDocument();
    expect(screen.getByText(/no scenario has been loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No scenarios yet" })).toBeInTheDocument();
    expect(screen.queryByText(/kwh|savings|simulated result/i)).not.toBeInTheDocument();
  });

  it("marks the selected page in the accessible navigation", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByRole("button", { name: "Reports" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
  });

  it("labels unfinished screens as placeholders", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Simulation lab/ }));
    expect(screen.getByText("Not implemented in Stage 1")).toBeInTheDocument();
    expect(screen.getByText(/does not load data, run calculations/i)).toBeInTheDocument();
  });

  it("keeps the engine offline indicator visible across navigation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Data sources" }));
    expect(screen.getByText("ENGINE OFFLINE")).toBeInTheDocument();
    expect(screen.getByText("NO SCENARIO LOADED")).toBeInTheDocument();
  });
});
