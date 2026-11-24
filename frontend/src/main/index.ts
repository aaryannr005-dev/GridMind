import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join, resolve } from "node:path";
import { EngineClient } from "./engine-client";
import { isRunHourlyScenarioPayload } from "../shared/protocol";

const isDevelopment = !app.isPackaged;
const applicationId = "com.gridmind.desktop";
app.setAppUserModelId(applicationId);
let mainWindow: BrowserWindow | null = null;
const engineClient = new EngineClient({
  appRoot: resolve(app.getAppPath(), ".."),
  resourcesPath: process.resourcesPath,
  platform: process.platform,
  packaged: app.isPackaged,
});

ipcMain.handle("gridmind:run-hourly-scenario", (event, payload: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("Unauthorized engine request");
  }
  if (!isRunHourlyScenarioPayload(payload)) {
    throw new Error("Scenario request has an invalid shape");
  }
  return engineClient.runHourlyScenario(payload);
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: "GridMind",
    backgroundColor: "#f4f6fa",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const ownOrigin = window.webContents.getURL();
    if (url !== ownOrigin && !(isDevelopment && url.startsWith("http://localhost:"))) {
      event.preventDefault();
    }
  });

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => engineClient.close());
