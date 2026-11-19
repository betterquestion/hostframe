import { Application, gpu } from "hostframe";
import type { GPUCanvasConfiguration, GPUDevice, GPUTexture, WindowGPUContext } from "hostframe";
import { GPUDevice as DeviceConstructor, GPUTextureUsage } from "hostframe/globals";

const adapter = await gpu.requestAdapter({ powerPreference: "low-power" });
if(!adapter) throw new Error("No compatible WebGPU adapter");
const device: GPUDevice = await adapter.requestDevice();
const prototype: GPUDevice = DeviceConstructor.prototype;
const app = new Application();
const context: WindowGPUContext = app.createWindow().getContext("webgpu");
const configuration: GPUCanvasConfiguration = { device, format: gpu.getPreferredCanvasFormat() };
context.configure(configuration);
const texture: GPUTexture = context.getCurrentTexture();
texture.createView();
const attachmentUsage: number = GPUTextureUsage.RENDER_ATTACHMENT;
device.createTexture({ usage: attachmentUsage, size: [1, 1], format: "rgba8unorm" });
// @ts-expect-error WebGPU still validates texture format names.
device.createTexture({ usage: attachmentUsage, size: [1, 1], format: "not-a-format" });
void prototype;
