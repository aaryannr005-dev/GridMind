import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { delimiter, join } from "node:path";
import {
  decodeEngineResponse,
  isRunHourlyScenarioPayload,
  isSensitivityReport,
  type EngineResponse,
  type GridMindScenarioReport,
  type RunHourlyScenarioPayload,
  type RunSensitivityAnalysisPayload,
  type SensitivityReport,
} from "../shared/protocol";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_PENDING_REQUESTS = 4;
const MAX_RESPONSE_BUFFER_CHARS = 2_000_000;

export class EngineClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EngineClientError";
  }
}

interface EngineConfig {
  appRoot: string;
  resourcesPath: string;
  platform: NodeJS.Platform;
  packaged: boolean;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: EngineClientError) => void;
  timeout: NodeJS.Timeout;
}

export class EngineClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private output = "";
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly config: EngineConfig,
    private readonly spawnChild: typeof spawn = spawn,
  ) {}

  runHourlyScenario(payload: RunHourlyScenarioPayload): Promise<GridMindScenarioReport> {
    if (!isRunHourlyScenarioPayload(payload)) {
      return Promise.reject(new EngineClientError("INVALID_REQUEST", "Scenario request has an invalid shape"));
    }
    if (this.pending.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new EngineClientError("ENGINE_BUSY", "The engine is handling other scenarios; try again shortly"));
    }

    return this.sendRequest("run_hourly_scenario", payload).then((result) => {
      if (!result || typeof result !== "object" || !("scenario_fingerprint" in result)) {
        throw new EngineClientError("ENGINE_PROTOCOL_ERROR", "The engine returned an invalid scenario report");
      }
      return result as GridMindScenarioReport;
    });
  }

  runSensitivityAnalysis(payload: RunSensitivityAnalysisPayload): Promise<SensitivityReport> {
    if (!isRunHourlyScenarioPayload(payload.scenario) || !Array.isArray(payload.multipliers)
      || payload.multipliers.length < 2 || payload.multipliers.length > 9
      || !payload.multipliers.every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)
      || new Set(payload.multipliers).size !== payload.multipliers.length
      || !["demand", "solar_generation", "import_tariff", "export_tariff"].includes(payload.parameter)
      || !["net_cost", "grid_import_kwh", "grid_export_kwh", "solar_self_consumption_ratio"].includes(payload.metric)
      || !["baseline", "gridmind"].includes(payload.strategy)) {
      return Promise.reject(new EngineClientError("INVALID_REQUEST", "Sensitivity request has an invalid shape"));
    }
    return this.sendRequest("run_sensitivity_analysis", payload).then((result) => {
      if (!isSensitivityReport(result)) throw new EngineClientError("ENGINE_PROTOCOL_ERROR", "The engine returned an invalid sensitivity report");
      return result;
    });
  }

  private sendRequest(operation: string, payload: unknown): Promise<unknown> {
    if (this.pending.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new EngineClientError("ENGINE_BUSY", "The engine is handling other scenarios; try again shortly"));
    }
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.ensureProcess();
    } catch {
      return Promise.reject(new EngineClientError(
        "ENGINE_START_FAILED",
        "Could not start the local GridMind engine. Reinstall the app or check the engine files.",
      ));
    }
    const id = randomUUID();
    return new Promise<GridMindScenarioReport>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new EngineClientError("ENGINE_TIMEOUT", "The scenario took too long to complete"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      const request = JSON.stringify({ id, operation, payload });
      child.stdin.write(`${request}\n`, "utf8", (error) => {
        if (!error) return;
        this.rejectRequest(id, new EngineClientError("ENGINE_IO_ERROR", "Could not send the scenario to the engine"));
        this.stopProcess(child);
      });
    });
  }

  close(): void {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.output = "";
    this.rejectAll(new EngineClientError("ENGINE_CLOSED", "The application is closing"));
    child.stdin.end();
    child.kill();
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const executable = this.config.packaged
      ? join(this.config.resourcesPath, "gridmind-engine", this.config.platform === "win32" ? "gridmind-engine.exe" : "gridmind-engine")
      : this.config.platform === "win32" ? "python" : "python3";
    const args = this.config.packaged ? [] : ["-m", "gridmind.bridge"];
    const env = this.config.packaged
      ? process.env
      : {
          ...process.env,
          PYTHONPATH: [join(this.config.appRoot, "src"), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
        };

    const child = this.spawnChild(executable, args, {
      cwd: this.config.appRoot,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(child, chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const text = String(chunk).trim();
      if (text) console.error("[GridMind engine]", text.slice(-4000));
    });
    child.on("error", () => {
      this.stopProcess(child, new EngineClientError(
        "ENGINE_START_FAILED",
        "Could not start the local GridMind engine. Reinstall the app or check the engine files.",
      ));
    });
    child.on("exit", (code, signal) => {
      this.stopProcess(child, new EngineClientError(
        "ENGINE_EXITED",
        `The local Python engine stopped${code === null ? ` (${signal ?? "unknown reason"})` : ` with exit code ${code}`}`,
      ));
    });
    return child;
  }

  private onStdout(child: ChildProcessWithoutNullStreams, chunk: string): void {
    if (child !== this.child) return;
    this.output += chunk;
    if (this.output.length > MAX_RESPONSE_BUFFER_CHARS && !this.output.includes("\n")) {
      this.stopProcess(child, new EngineClientError("ENGINE_PROTOCOL_ERROR", "The engine response exceeded the size limit"));
      return;
    }

    let newline = this.output.indexOf("\n");
    while (newline >= 0) {
      if (newline > MAX_RESPONSE_BUFFER_CHARS) {
        this.stopProcess(child, new EngineClientError("ENGINE_PROTOCOL_ERROR", "The engine response exceeded the size limit"));
        return;
      }
      const line = this.output.slice(0, newline);
      this.output = this.output.slice(newline + 1);
      this.onResponseLine(line);
      newline = this.output.indexOf("\n");
    }
    if (this.output.length > MAX_RESPONSE_BUFFER_CHARS) {
      this.stopProcess(child, new EngineClientError("ENGINE_PROTOCOL_ERROR", "The engine response exceeded the size limit"));
    }
  }

  private onResponseLine(line: string): void {
    let response: EngineResponse;
    try {
      response = decodeEngineResponse(JSON.parse(line) as unknown);
    } catch {
      const child = this.child;
      if (child) this.stopProcess(child, new EngineClientError("ENGINE_PROTOCOL_ERROR", "The engine returned an unreadable response"));
      return;
    }
    if (response.id === null) return;

    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new EngineClientError(response.error.code, response.error.message));
    }
  }

  private rejectRequest(id: string, error: EngineClientError): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    pending.reject(error);
  }

  private rejectAll(error: EngineClientError): void {
    this.pending.forEach((pending, id) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    });
  }

  private stopProcess(child: ChildProcessWithoutNullStreams, error?: EngineClientError): void {
    if (this.child !== child) return;
    this.child = null;
    this.output = "";
    this.rejectAll(error ?? new EngineClientError("ENGINE_EXITED", "The local Python engine stopped"));
    child.kill();
  }
}
