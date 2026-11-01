// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SliderNumberField } from "./SliderNumberField";

const base = {
  label: "Battery capacity",
  unit: "kWh",
  min: 0,
  max: 20,
  step: 0.1,
};

afterEach(cleanup);

describe("SliderNumberField", () => {
  it("writes the exact typed value through, whatever its precision", () => {
    const onValueChange = vi.fn();
    render(<SliderNumberField {...base} value="10" onValueChange={onValueChange} />);

    fireEvent.change(screen.getByRole("spinbutton", { name: /Battery capacity/ }), { target: { value: "3.14159" } });
    expect(onValueChange).toHaveBeenCalledWith("3.14159");
  });

  it("writes rounded slider values that match the slider step", () => {
    const onValueChange = vi.fn();
    render(<SliderNumberField {...base} value="10" onValueChange={onValueChange} />);

    fireEvent.input(screen.getByRole("slider", { name: /Battery capacity \(kWh\) slider/ }), { target: { value: "12.5" } });
    expect(onValueChange).toHaveBeenCalledWith("12.5");
    onValueChange.mockClear();
    fireEvent.input(screen.getByRole("slider", { name: /Battery capacity \(kWh\) slider/ }), { target: { value: "12.34" } });
    expect(onValueChange).toHaveBeenCalledWith("12.3");
  });

  it("mirrors typed values onto the slider without clamping what can be typed", () => {
    const view = render(<SliderNumberField {...base} value="10" onValueChange={vi.fn()} />);

    const slider = screen.getByRole("slider", { name: /Battery capacity \(kWh\) slider/ }) as HTMLInputElement;
    expect(slider.value).toBe("10");

    // Parents re-render with the typed value; beyond the nominal maximum the
    // slider stretches to follow it rather than blocking exact entry.
    view.rerender(<SliderNumberField {...base} value="30" onValueChange={vi.fn()} />);
    expect((screen.getByRole("slider", { name: /Battery capacity \(kWh\) slider/ }) as HTMLInputElement).max).toBe("30");
  });

  it("disables the slider for empty or non-numeric values", () => {
    render(<SliderNumberField {...base} value="" onValueChange={vi.fn()} />);
    expect(screen.getByRole("slider", { name: /Battery capacity \(kWh\) slider/ })).toBeDisabled();
  });

  it("marks the numeric entry as invalid when the owner asks", () => {
    render(<SliderNumberField {...base} value="-1" invalid onValueChange={vi.fn()} />);
    expect(screen.getByRole("spinbutton", { name: /Battery capacity/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("shows finer steps for efficiency fields", () => {
    const onValueChange = vi.fn();
    render(
      <SliderNumberField {...base} value="1" min={0} max={1} step={0.01} onValueChange={onValueChange} />,
    );
    fireEvent.input(screen.getByRole("slider", { name: /Battery capacity \(kWh\) slider/ }), { target: { value: "0.952" } });
    expect(onValueChange).toHaveBeenCalledWith("0.95");
  });
});
