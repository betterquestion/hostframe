import type * as WebGPU from "../build/types/webgpu.js";

// Use the consumer's WebGPU types when present so they match other libraries in the project.
export type WebGPUGlobals = {
  [Name in keyof typeof WebGPU]: Name extends keyof typeof globalThis ? (typeof globalThis)[Name] : (typeof WebGPU)[Name]
};

export type GPU = WebGPUGlobals["GPU"]["prototype"];
export type GPUAdapter = WebGPUGlobals["GPUAdapter"]["prototype"];
export type GPUDevice = WebGPUGlobals["GPUDevice"]["prototype"];
export type GPUTexture = WebGPUGlobals["GPUTexture"]["prototype"];
export type GPURequestAdapterOptions = NonNullable<Parameters<GPU["requestAdapter"]>[0]>;
export type GPUCanvasConfiguration = Parameters<WebGPUGlobals["GPUCanvasContext"]["prototype"]["configure"]>[0];
export type GPUTextureFormat = GPUCanvasConfiguration["format"];
