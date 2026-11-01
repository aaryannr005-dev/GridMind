import { useId } from "react";

export interface SliderNumberFieldProps {
  label: string;
  unit: string;
  value: string;
  min: number;
  max: number;
  /** Slider step. Also controls the decimals used when a value comes from the slider. */
  step: number;
  invalid?: boolean;
  onValueChange: (value: string) => void;
}

function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Math.min(6, decimals);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A paired slider and numeric entry bound to one value.
 *
 * Both inputs stay synchronized in both directions: dragging the slider writes
 * the numeric input (rounded to the slider step), while typing an exact value
 * in the numeric input moves the slider to the closest position it can show.
 * The numeric entry accepts arbitrary values of any precision; the slider is
 * only a convenience pointer and never clamps what can be typed.
 */
export function SliderNumberField({
  label, unit, value, min, max, step, invalid, onValueChange,
}: SliderNumberFieldProps) {
  const numberId = useId();
  const decimals = decimalsForStep(step);
  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed);
  const sliderMin = min;
  const sliderMax = valid ? Math.max(max, parsed) : max;
  const sliderValue = valid ? clamp(parsed, sliderMin, sliderMax) : sliderMin;

  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor={numberId} className="field-label">{label}</label>
        <span className="field-unit">{unit}</span>
      </div>
      <div className="slider-number">
        <input
          type="range"
          className="slider-input"
          aria-label={`${label} (${unit}) slider`}
          min={sliderMin}
          max={sliderMax}
          step={step}
          disabled={!valid}
          value={sliderValue}
          onInput={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onValueChange(next.toFixed(decimals));
          }}
          onChange={() => { /* live dragging is handled through onInput */ }}
        />
        <input
          id={numberId}
          type="number"
          className="number-input"
          inputMode="decimal"
          step="any"
          min={min}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(event) => onValueChange(event.target.value)}
        />
      </div>
      <span className="slider-bounds" aria-hidden="true">
        <span>{sliderMin.toFixed(decimals)} {unit}</span>
        <span>{sliderMax.toFixed(decimals)} {unit}</span>
      </span>
    </div>
  );
}
