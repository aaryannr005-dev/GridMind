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


  it("matches concurrent responses by request id even when they arrive out of order", async () => {
    const child = new FakeChild();
    const client = new EngineClient({
      appRoot: "/gridmind", resourcesPath: "/gridmind/resources", platform: "linux", packaged: false,
    }, (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import("node:child_process").spawn);
    const lines: string[] = [];
    child.stdin.on("data", (chunk) => { lines.push(...chunk.toString().trim().split("\n")); });

    const first = client.runHourlyScenario(payload());
    const second = client.runHourlyScenario(payload());
    await new Promise<void>((resolve) => setImmediate(resolve));
    const requests = lines.map((line) => JSON.parse(line) as { id: string });
    expect(requests).toHaveLength(2);

    child.stdout.write(`${JSON.stringify({ id: requests[1].id, ok: true, result: { ...validScenarioReport(), scenario_fingerprint: "second-response" } })}\n`);
    child.stdout.write(`${JSON.stringify({ id: requests[0].id, ok: true, result: { ...validScenarioReport(), scenario_fingerprint: "first-response" } })}\n`);

    await expect(first).resolves.toMatchObject({ scenario_fingerprint: "first-response" });
    await expect(second).resolves.toMatchObject({ scenario_fingerprint: "second-response" });
    client.close();
  });

  it("rejects all pending requests and stops the process after an unreadable protocol line", async () => {
    const child = new FakeChild();
    const client = new EngineClient({
      appRoot: "/gridmind", resourcesPath: "/gridmind/resources", platform: "linux", packaged: false,
    }, (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import("node:child_process").spawn);
    const first = client.runHourlyScenario(payload());
    const second = client.runHourlyScenario(payload());
    await new Promise<void>((resolve) => setImmediate(resolve));
    child.stdout.write("{not-json}\n");

    await expect(first).rejects.toMatchObject({ code: "ENGINE_PROTOCOL_ERROR" });
    await expect(second).rejects.toMatchObject({ code: "ENGINE_PROTOCOL_ERROR" });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("rejects pending work when the engine exits unexpectedly", async () => {
    const child = new FakeChild();
    const client = new EngineClient({
      appRoot: "/gridmind", resourcesPath: "/gridmind/resources", platform: "linux", packaged: false,
    }, (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import("node:child_process").spawn);
    const result = client.runHourlyScenario(payload());
    await new Promise<void>((resolve) => setImmediate(resolve));
    child.emit("exit", 2, null);

    await expect(result).rejects.toMatchObject({ code: "ENGINE_EXITED" });
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("enforces the pending-request limit without sending an extra request", async () => {
    const child = new FakeChild();
    const client = new EngineClient({
      appRoot: "/gridmind", resourcesPath: "/gridmind/resources", platform: "linux", packaged: false,
    }, (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import("node:child_process").spawn);
    const lines: string[] = [];
    child.stdin.on("data", (chunk) => { lines.push(...chunk.toString().trim().split("\n")); });
    const pending = Array.from({ length: 4 }, () => client.runHourlyScenario(payload()));
    const rejected = client.runHourlyScenario(payload());
    await expect(rejected).rejects.toMatchObject({ code: "ENGINE_BUSY" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(lines).toHaveLength(4);

    for (const line of lines) {
      const request = JSON.parse(line) as { id: string };
      child.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: validScenarioReport() })}\n`);
    }
    await expect(Promise.all(pending)).resolves.toHaveLength(4);
    client.close();
  });

  it("rejects all outstanding requests when the application closes the client", async () => {
    const child = new FakeChild();
    const client = new EngineClient({
      appRoot: "/gridmind", resourcesPath: "/gridmind/resources", platform: "linux", packaged: false,
    }, (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof import("node:child_process").spawn);
    const first = client.runHourlyScenario(payload());
    const second = client.runHourlyScenario(payload());
    await new Promise<void>((resolve) => setImmediate(resolve));
    client.close();

    await expect(first).rejects.toMatchObject({ code: "ENGINE_CLOSED" });
    await expect(second).rejects.toMatchObject({ code: "ENGINE_CLOSED" });
    expect(child.kill).toHaveBeenCalledOnce();
  });

});
