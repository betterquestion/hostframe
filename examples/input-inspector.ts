import { Application, getKeyName } from "hostframe";
import type { GPUDevice } from "hostframe";
import { clear } from "./support/clear.js";

const app = new Application();
const devices: GPUDevice[] = [];

try {
  const window = app.createWindow({
    title: "Input inspector",
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
  context.configure({ device: device, format: app.gpu.getPreferredCanvasFormat() });
  const render = clear(device, context, [0.1, 0.2, 0.4, 1]);

  context.draw(render);
  window.on("render", render);

  console.log("Type, move and click the pointer, scroll, or change focus. Close the window to exit.");
  const unsubscribe = window.on("key", event => {
    console.log("Key:", getKeyName(event.key), event, "down:", window.isKeyDown(event.key));
  });

  window.on("text", ({ codepoint }) => {
    console.log("Text:", String.fromCodePoint(codepoint));
  });
  window.on("pointerMove", event => {
    console.log("Pointer:", event, "framebuffer:", window.toFramebuffer(event.x, event.y));
  });
  window.on("pointerButton", event => {
    console.log("Button:", event, "down:", window.isButtonDown(event.button));
  });
  window.on("scroll", event => {
    console.log("Scroll:", event);
  });
  window.on("focus", event => {
    console.log("Focus:", event.focused, "state:", window.input);
  });
  try {
    await app.run();
  } finally {
    unsubscribe();
  }
} finally {
  try {
    app.dispose();
  } finally {
    for(const device of devices) {
      device.destroy();
    }
  }
}
