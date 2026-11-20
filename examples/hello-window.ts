import { Application } from "hostframe";
import type { GPUDevice } from "hostframe";
import { clear } from "./support/clear.js";

console.log("Starting Hostframe...");
const app = new Application();
let device: GPUDevice | undefined;

try {
  const window = app.createWindow({
    title: "Hello Hostframe",
    width: 640,
    height: 480
  });

  console.log("Window created; initializing WebGPU...");
  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No compatible WebGPU adapter");
  }

  device = await adapter.requestDevice();

  context.configure({ device, format: app.gpu.getPreferredCanvasFormat() });
  context.draw(clear(device, context, [0.1, 0.2, 0.4, 1]));
  console.log("Close the window to exit.");
  await app.run();
} finally {
  app.dispose();
  device?.destroy();
}
