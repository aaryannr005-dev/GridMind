import { contextBridge, ipcRenderer } from "electron";
import type { GridMindScenarioReport, RunHourlyScenarioPayload } from "../shared/protocol";

contextBridge.exposeInMainWorld("gridmindDesktop", {
  platform: process.platform,
  runHourlyScenario: (payload: RunHourlyScenarioPayload): Promise<GridMindScenarioReport> =>
    ipcRenderer.invoke("gridmind:run-hourly-scenario", payload),
});
