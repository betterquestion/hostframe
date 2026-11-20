import { Application } from "hostframe";
import type { GPUDevice } from "hostframe";

const app = new Application();
let device: GPUDevice | undefined;

try {
  const window = app.createWindow({
    title: "WebGPU triangle",
    width: 640,
    height: 480,
    resizable: true
  });
  const context = window.getContext("webgpu");
  // Unlike a generic adapter request, this selects an adapter that can present to this window.
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No compatible WebGPU adapter");
  }

  device = await adapter.requestDevice();
  const gpuDevice = device;
  const format = app.gpu.getPreferredCanvasFormat();

  context.configure({ device, format });
  const shader = device.createShaderModule({
    code: `
      @vertex fn vertexMain(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
        let positions = array(vec2f(0.0, 0.7), vec2f(-0.7, -0.7), vec2f(0.7, -0.7));
        return vec4f(positions[i], 0.0, 1.0);
      }
      @fragment fn fragmentMain() -> @location(0) vec4f {
        return vec4f(1.0, 0.6, 0.2, 1.0);
      }
    `
  });
  const pipeline = gpuDevice.createRenderPipeline({
    layout: "auto",
    vertex: { module: shader, entryPoint: "vertexMain" },
    fragment: {
      module: shader,
      entryPoint: "fragmentMain",
      targets: [{ format }]
    },
    primitive: { topology: "triangle-list" }
  });

  // The current texture is valid only inside this synchronous callback.
  window.on("render", () => {
    const encoder = gpuDevice.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: [0.1, 0.2, 0.4, 1],
        loadOp: "clear",
        storeOp: "store"
      }]
    });

    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    gpuDevice.queue.submit([encoder.finish()]);
  });
  console.log("Close the window to exit.");
  await app.run();
} finally {
  // Release presentation surfaces before destroying the caller-owned device.
  app.dispose();
  device?.destroy();
}
