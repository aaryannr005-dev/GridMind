// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { EngineClient } from "./engine-client";
import type { RunHourlyScenarioPayload } from "../shared/protocol";
import { validScenarioReport } from "../shared/protocol.fixtures";

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

function payload(): RunHourlyScenarioPayload {
  return {
    start_date: "2026-01-15",
    demand_kwh: Array(24).fill(1),
    solar_generation_kwh: Array(24).fill(0),
    import_rate_per_kwh: Array(24).fill(0.2),
    export_rate_per_kwh: Array(24).fill(0.05),
    battery: { capacity_kwh: 4, max_charge_power_kw: 2, max_discharge_power_kw: 2 },
  };
}

describe("EngineClient", () => {
  it("starts Python without a shell and resolves the matching structured report", async () => {
    const child = new FakeChild();
    const spawnChild = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
    const client = new EngineClient({
      appRoot: "/gridmind",
      resourcesPath: "/gridmind/resources",
      platform: "linux",
      packaged: false,
    }, spawnChild as unknown as typeof import("node:child_process").spawn);
    const input = payload();
    let requestLine = "";
    child.stdin.on("data", (chunk) => { requestLine += chunk.toString(); });

    const result = client.runHourlyScenario(input);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const request = JSON.parse(requestLine) as { id: string; operation: string; payload: RunHourlyScenarioPayload };

    expect(spawnChild).toHaveBeenCalledWith("python3", ["-m", "gridmind.bridge"], expect.objectContaining({ shell: false }));
    expect(request.operation).toBe("run_hourly_scenario");
    expect(request.payload).toEqual(input);
    child.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: validScenarioReport() })}\n`);
    await expect(result).resolves.toMatchObject({ scenario_fingerprint: "test-fingerprint" });
    client.close();
  });

  it("converts backend validation responses into typed errors", async () => {
    const child = new FakeChild();
    const client = new EngineClient({
      appRoot: "/gridmind",
      resourcesPath: "/gridmind/resources",
      platform: "linux",
      packaged: false,
    }, (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import("node:child_process").spawn);
    let requestId = "";
    child.stdin.on("data", (chunk) => {
      requestId = (JSON.parse(chunk.toString()) as { id: string }).id;
    });

    const result = client.runHourlyScenario(payload());
    await new Promise<void>((resolve) => setImmediate(resolve));
    child.stdout.write(`${JSON.stringify({
      id: requestId,
      ok: false,
      error: { code: "INVALID_SCENARIO", message: "Battery capacity is invalid" },
    })}\n`);
    await expect(result).rejects.toMatchObject({ code: "INVALID_SCENARIO", message: "Battery capacity is invalid" });
    client.close();
  });

  it("sends sensitivity requests and validates the structured result", async () => {
    const child = new FakeChild();
    const client = new EngineClient({
      appRoot: "/gridmind",
      resourcesPath: "/gridmind/resources",
      platform: "linux",
      packaged: false,
    }, (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import("node:child_process").spawn);
    let requestLine = "";
    child.stdin.on("data", (chunk) => { requestLine += chunk.toString(); });

    const requestPayload = {
      scenario: payload(),
      parameter: "demand" as const,
      multipliers: [0.5, 1, 1.5],
      metric: "net_cost" as const,
      strategy: "gridmind" as const,
    };
    const result = client.runSensitivityAnalysis(requestPayload);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const request = JSON.parse(requestLine) as { id: string; operation: string };
    expect(request.operation).toBe("run_sensitivity_analysis");
    child.stdout.write(`${JSON.stringify({
      id: request.id,
      ok: true,
      result: {
        parameter: "demand", metric: "net_cost", currency: "MYR", baseline_value: 2,
        points: [0.5, 1, 1.5].map((multiplier) => ({
          multiplier, metric_value: 2 * multiplier, absolute_change: 2 * (multiplier - 1),
          percentage_change: (multiplier - 1) * 100, feasible: true, error: null,
        })),
      },
    })}\n`);
    await expect(result).resolves.toMatchObject({ parameter: "demand", baseline_value: 2 });
    client.close();
  });

});
