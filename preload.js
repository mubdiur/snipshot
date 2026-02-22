import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  onRectangles: (callback) => ipcRenderer.on("update-rectangles", (_, data) => callback(data)),
});
