import { setTimeout as delay } from "node:timers/promises";
import { Application } from "hostframe";
import type { GPUDevice } from "hostframe";
import { clear } from "./support/clear.js";

const app = new Application();
let device: GPUDevice | undefined;

try {
  const window = app.createWindow({
    title: "Custom loop",
    width: 640,
    height: 480
  });
  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No compatible WebGPU adapter");
  }

  device = await adapter.requestDevice();

  context.configure({ device, format: app.gpu.getPreferredCanvasFormat() });
  const render = clear(device, context, [0.1, 0.2, 0.4, 1]);

  console.log("Close the window to exit the custom loop.");

  while(app.pollEvents()) {
    context.draw(render);

    await delay(16);
  }
} finally {
  app.dispose();
  device?.destroy();
}
