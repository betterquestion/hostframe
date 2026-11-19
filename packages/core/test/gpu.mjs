import assert from "node:assert/strict";

export async function requestDevice(source) {
  const adapter = await source.requestAdapter();
  assert.ok(adapter, "Expected a compatible WebGPU adapter");
  return adapter.requestDevice();
}

export function configureWindow(window, device, format) {
  const context = window.getContext("webgpu");
  context.configure({ device, format });
  return context;
}

export function encodeClear(encoder, view, color = [1, 0, 1, 1]) {
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view, clearValue: color, loadOp: "clear", storeOp: "store" }]
  });
  pass.end();
}

export function clearFrame(device, texture) {
  const encoder = device.createCommandEncoder();
  encodeClear(encoder, texture.createView());
  device.queue.submit([encoder.finish()]);
}

export function drawFrame(context, device) {
  assert.equal(context.draw(() => {
    clearFrame(device, context.getCurrentTexture());
  }), true);
}
