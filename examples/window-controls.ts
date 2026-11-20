import { Application, Key } from "hostframe";
import type { GPUDevice } from "hostframe";
import { clear } from "./support/clear.js";

const app = new Application();
const devices: GPUDevice[] = [];
let active = true;
let showTimer: ReturnType<typeof setTimeout> | undefined;

try {
  const window = app.createWindow({
    title: "Window controls",
    width: 640,
    height: 480,
    resizable: true
  });

  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No compatible WebGPU adapter");
  }

  const device = await adapter.requestDevice();

  devices.push(device);
  context.configure({ device: device, format: app.gpu.getPreferredCanvasFormat() });
  const render = clear(device, context, [0.1, 0.2, 0.4, 1]);

  context.draw(render);
  window.on("render", render);
  let enlarged = false;

  console.log("S: toggle size; P: move; T: change title; H: hide for two seconds.");
  console.log("Resize, minimize, restore, or focus the window to see events.");
  console.log("Initial metrics:", window.metrics);
  window.on("metrics", ({ metrics }) => {
    console.log("Metrics (window units and framebuffer pixels):", metrics);
  });
  window.on("focus", event => {
    console.log("Focus:", event.focused);
  });
  window.on("minimize", () => {
    console.log("Minimized");
  });
  window.on("restore", () => {
    console.log("Restored");
  });
  window.on("key", event => {
    if(event.action !== "press") {
      return;
    }

    // Native window mutations run after the input batch has finished.
    if(event.key === Key.S) {
      enlarged = !enlarged;
      const size = enlarged ? [800, 600] : [640, 480];

      setImmediate(() => {
        if(active) {
          window.setSize(size[0], size[1]);
        }
      });
    } else if(event.key === Key.P) {
      setImmediate(() => {
        if(active) {
          window.setPosition(100, 100);
        }
      });
    } else if(event.key === Key.T) {
      setImmediate(() => {
        if(active) {
          window.setTitle("Title changed");
        }
      });
    } else if(event.key === Key.H) {
      setImmediate(() => {
        if(active) {
          window.setVisible(false);
        }
      });
      clearTimeout(showTimer);
      showTimer = setTimeout(() => window.setVisible(true), 2000);
    }
  });
  await app.run();
} finally {
  active = false;
  clearTimeout(showTimer);
  try {
    app.dispose();
  } finally {
    for(const device of devices) {
      device.destroy();
    }
  }
}
