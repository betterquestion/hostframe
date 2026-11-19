import assert from "node:assert/strict";
import type { GPU, GPUDevice, GPUTexture, GPUTextureFormat, Window, WindowGPUContext } from "../dist/index.js";

export async function requestDevice(source: Pick<GPU, "requestAdapter">) {
  const adapter = await source.requestAdapter();
  assert.ok(adapter, "Expected a compatible WebGPU adapter");
  return adapter.requestDevice();
}

export function configureWindow(window: Window, device: GPUDevice, format: GPUTextureFormat) {
  const context = window.getContext("webgpu");
  context.configure({ device, format });
  return context;
}

type CommandEncoder = ReturnType<GPUDevice["createCommandEncoder"]>;
type TextureView = ReturnType<GPUTexture["createView"]>;

export function encodeClear(encoder: CommandEncoder, view: TextureView, color: [number, number, number, number] = [1, 0, 1, 1]) {
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view, clearValue: color, loadOp: "clear", storeOp: "store" }]
  });
  pass.end();
}

export function clearFrame(device: GPUDevice, texture: GPUTexture) {
  const encoder = device.createCommandEncoder();
  encodeClear(encoder, texture.createView());
  device.queue.submit([encoder.finish()]);
}

export function drawFrame(context: WindowGPUContext, device: GPUDevice) {
  assert.equal(context.draw(() => {
    clearFrame(device, context.getCurrentTexture());
  }), true);
}
