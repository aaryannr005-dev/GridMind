import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EnergyMapPage } from "./EnergyMapPage";

afterEach(cleanup);

describe("Phase 4E public data experience", () => {
  it("shows both registered Malaysian public datasets with provenance and units", () => {
    render(<EnergyMapPage />);

    expect(screen.getByRole("heading", { name: "Malaysian electricity data catalogue" })).toBeInTheDocument();
    expect(screen.getByTestId("dataset-electricity_consumption")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-electricity_supply")).toBeInTheDocument();
    expect(screen.getAllByText("Malaysia, national aggregate")).toHaveLength(2);
    expect(screen.getAllByText("million kWh")).toHaveLength(2);
    expect(screen.getAllByText("25 November 2026")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "CC BY 4.0" })).toHaveLength(2);
  });

  it("filters datasets by type and restores all records", () => {
    render(<EnergyMapPage />);
    const filter = screen.getByRole("combobox", { name: "Dataset type" });

    fireEvent.change(filter, { target: { value: "supply" } });
    expect(screen.getByTestId("dataset-electricity_supply")).toBeInTheDocument();
    expect(screen.queryByTestId("dataset-electricity_consumption")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 datasets shown");

    fireEvent.change(filter, { target: { value: "all" } });
    expect(screen.getByTestId("dataset-electricity_supply")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-electricity_consumption")).toBeInTheDocument();
  });

  it("searches dataset names and category identifiers", () => {
    render(<EnergyMapPage />);
    const search = screen.getByRole("searchbox", { name: "Search datasets, variables or categories" });

    fireEvent.change(search, { target: { value: "local_domestic" } });
    expect(screen.getByTestId("dataset-electricity_consumption")).toBeInTheDocument();
    expect(screen.queryByTestId("dataset-electricity_supply")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "no-such-category" } });
    expect(screen.getByText("No matching datasets")).toBeInTheDocument();
  });

  it("makes provisional status and the absence of imported observations explicit", () => {
    render(<EnergyMapPage />);

    expect(screen.getAllByText("Quality flag: latest six months provisional")).toHaveLength(2);
    expect(screen.getAllByText(/January to June 2026 may be revised/)).toHaveLength(2);
    expect(screen.getByText("Import status: catalogue only")).toBeInTheDocument();
    expect(screen.getByText(/does not yet import, cache or display the CSV observations/)).toBeInTheDocument();
    expect(screen.getByText(/does not convert them into hourly household demand/)).toBeInTheDocument();
  });
});
