import type { GPUDevice, WindowGPUContext } from "hostframe";

export function clear(
  device: GPUDevice,
  context: WindowGPUContext,
  color: [red: number, green: number, blue: number, alpha: number] = [0, 0, 0, 1]
) {
  return function() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: color,
        loadOp: "clear",
        storeOp: "store"
      }]
    });

    pass.end();
    device.queue.submit([encoder.finish()]);

    return undefined;
  };
}
