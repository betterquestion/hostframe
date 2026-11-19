# Hostframe

Build desktop applications with WebGPU in Node.js and Bun. Hostframe provides native windows, input, and a WebGPU rendering context.

## Linux alpha

This early release runs on x64 Linux with glibc and Vulkan. Opening a window also requires X11.

```sh
npm install hostframe
```

## Create a window

```js
import { Application } from "hostframe";

const app = new Application();
let device;

try {
  const window = app.createWindow({
    title: "Hostframe",
    width: 640,
    height: 480
  });
  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) throw new Error("No compatible WebGPU adapter");

  device = await adapter.requestDevice();
  context.configure({
    device,
    format: app.gpu.getPreferredCanvasFormat()
  });

  window.on("render", () => {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: [0.1, 0.2, 0.4, 1],
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    pass.end();

    device.queue.submit([encoder.finish()]);
  });

  await app.run();
} finally {
  app.dispose();
  device?.destroy();
}
```

`app.run()` polls events and renders until the window closes. Render callbacks are synchronous; the current texture is valid only during the callback. Dispose the application before destroying its device.

Use `window.on()` for input and lifecycle events, `app.on("fixedUpdate", ...)` for fixed-step updates, or `app.pollEvents()` and `context.draw()` for your own loop. See the [source and development documentation](https://github.com/betterquestion/hostframe).
