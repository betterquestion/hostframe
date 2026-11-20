import { Application, Key } from "hostframe";
import type { GPUDevice } from "hostframe";

const app = new Application();
let device: GPUDevice | undefined;

try {
  const window = app.createWindow({
    title: "Update loop",
    width: 640,
    height: 480
  });
  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No compatible WebGPU adapter");
  }

  device = await adapter.requestDevice();
  const gpuDevice = device;

  context.configure({ device: gpuDevice, format: app.gpu.getPreferredCanvasFormat() });
  let paused = false;
  let elapsed = 0;

  console.log("Space: pause/resume; Escape: stop the application.");
  window.on("key", event => {
    if(event.action !== "press") {
      return;
    }

    if(event.key === Key.SPACE) {
      paused = !paused;
      if(paused) {
        app.pause();
      } else {
        app.resume();
      }

      console.log(paused ? "Paused" : "Resumed");
    } else if(event.key === Key.ESCAPE) {
      app.stop();
    }
  });
  app.on("fixedUpdate", ({ dt, tick }) => {
    elapsed += dt;
    if(tick % 60 === 0) {
      console.log(`Tick ${tick}: ${elapsed.toFixed(1)} simulated seconds`);
    }
  });
  window.on("render", ({ alpha }) => {
    const encoder = gpuDevice.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: [0.1, 0.2, 0.3 + 0.2 * Math.sin(elapsed + alpha / 60), 1],
        loadOp: "clear",
        storeOp: "store"
      }]
    });

    pass.end();
    gpuDevice.queue.submit([encoder.finish()]);
  });
  await app.run({ updateHz: 60 });
} finally {
  app.dispose();
  device?.destroy();
}
