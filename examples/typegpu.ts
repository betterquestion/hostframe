import { Application, installWebGPUGlobals } from "hostframe";
import type { GPUDevice } from "hostframe";
import { tgpu, d } from "typegpu";

installWebGPUGlobals();
const app = new Application();
let device: GPUDevice | undefined;
let root: ReturnType<typeof tgpu.initFromDevice> | undefined;

try {
  const window = app.createWindow({
    title: "TypeGPU triangle",
    width: 640,
    height: 480
  });
  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No compatible WebGPU adapter");
  }

  device = await adapter.requestDevice();
  const format = app.gpu.getPreferredCanvasFormat();

  context.configure({ device, format });
  // Use the window-compatible device with TypeGPU; Hostframe still owns presentation.
  root = tgpu.initFromDevice({ device });

  const vertex = tgpu.vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { position: d.builtin.position }
  })`{
    let positions = array<vec2f, 3>(vec2f(0.0, 0.7), vec2f(-0.7, -0.7), vec2f(0.7, -0.7));
    return Out(vec4f(positions[in.vertexIndex], 0.0, 1.0));
  }`;

  const fragment = tgpu.fragmentFn({ out: d.vec4f })`{
    return vec4f(1.0, 0.6, 0.2, 1.0);
  }`;

  const pipeline = root.createRenderPipeline({
    vertex,
    fragment,
    targets: { format }
  });

  window.on("render", () => {
    pipeline.withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0.1, 0.2, 0.4, 1],
      loadOp: "clear",
      storeOp: "store"
    }).draw(3);
  });

  console.log("Close the window to exit.");

  await app.run();
} finally {
  app.dispose();
  root?.destroy();
  device?.destroy();
}
