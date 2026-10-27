import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("gridmindDesktop", {
  platform: process.platform,
});
