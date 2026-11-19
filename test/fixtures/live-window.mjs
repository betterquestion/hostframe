import { Application } from "../../dist/index.js";
import { configureWindow, drawFrame, requestDevice } from "../gpu.mjs";

const app = new Application();
const window = app.createWindow();
const device = await requestDevice(window.getContext("webgpu"));
const context = configureWindow(window, device, app.gpu.getPreferredCanvasFormat());
drawFrame(context, device);
await device.queue.onSubmittedWorkDone();

// Keep the rendered window reachable so process exit exercises native teardown.
Object.defineProperty(globalThis, "liveApplication", { value: app });
console.log("Rendered with a live window at process exit");
