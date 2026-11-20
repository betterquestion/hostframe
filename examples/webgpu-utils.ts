import { Application, installWebGPUGlobals } from "hostframe";
import type { GPUDevice } from "hostframe";
import { createBuffersAndAttributesFromArrays } from "webgpu-utils";

installWebGPUGlobals();
const app = new Application();
let device: GPUDevice | undefined;
let vertexBuffer: GPUBuffer | undefined;

try {
  const window = app.createWindow({
    title: "webgpu-utils triangle",
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
  const format = app.gpu.getPreferredCanvasFormat();

  context.configure({ device, format });

  const { buffers, bufferLayouts, numElements } = createBuffersAndAttributesFromArrays(device, {
    position: { data: [0, 0.7, -0.7, -0.7, 0.7, -0.7], numComponents: 2 }
  });

  vertexBuffer = buffers[0];
  const vertices = vertexBuffer;
  const shader = device.createShaderModule({
    code: `
      @vertex fn vertexMain(@location(0) position: vec2f) -> @builtin(position) vec4f {
        return vec4f(position, 0.0, 1.0);
      }
      @fragment fn fragmentMain() -> @location(0) vec4f {
        return vec4f(0.3, 0.8, 0.6, 1.0);
      }
    `
  });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vertexMain",
      buffers: bufferLayouts
    },
    fragment: {
      module: shader,
      entryPoint: "fragmentMain",
      targets: [{ format }]
    }
  });

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
    pass.setVertexBuffer(0, vertices);
    pass.draw(numElements);
    pass.end();
    gpuDevice.queue.submit([encoder.finish()]);
  });
  console.log("Close the window to exit.");
  await app.run();
} finally {
  app.dispose();
  vertexBuffer?.destroy();
  device?.destroy();
}
