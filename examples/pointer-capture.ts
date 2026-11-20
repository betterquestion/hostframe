import { Application, Key } from "hostframe";
import type { GPUDevice } from "hostframe";
import { clear } from "./support/clear.js";

const app = new Application();
const devices: GPUDevice[] = [];

try {
  const window = app.createWindow({
    title: "Pointer capture",
    width: 640,
    height: 480
  });

  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No compatible WebGPU adapter");
  }

  const device = await adapter.requestDevice();

  devices.push(device);
  context.configure({ device, format: app.gpu.getPreferredCanvasFormat() });
  const render = clear(device, context, [0.1, 0.2, 0.4, 1]);

  context.draw(render);
  window.on("render", render);

  console.log("Press C to capture the pointer, move it, and press Escape to release it.");
  window.on("key", event => {
    if(event.action !== "press") {
      return;
    }

    if(event.key === Key.C) {
      window.setPointerCapture(true);
    }

    if(event.key === Key.ESCAPE) {
      window.setPointerCapture(false);
    }
  });
  window.on("pointerCapture", event => {
    console.log("Capture:", event.captured, "raw motion:", event.rawMotion);
  });
  window.on("pointerMove", event => {
    if(event.captured) {
      console.log("Relative motion:", event.deltaX, event.deltaY);
    }
  });
  await app.run();
} finally {
  try {
    app.dispose();
  } finally {
    for(const device of devices) {
      device.destroy();
    }
  }
}
