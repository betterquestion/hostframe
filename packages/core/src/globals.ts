import { dawn } from "./native.js";
import type { WebGPUGlobals } from "./webgpu-types.js";
export { gpu } from "./bridge.js";

type GPUConstants = {
  GPUBufferUsage: Readonly<Record<"MAP_READ" | "MAP_WRITE" | "COPY_SRC" | "COPY_DST" | "INDEX" | "VERTEX" | "UNIFORM" | "STORAGE" | "INDIRECT" | "QUERY_RESOLVE", number>>,
  GPUColorWrite: Readonly<Record<"RED" | "GREEN" | "BLUE" | "ALPHA" | "ALL", number>>,
  GPUMapMode: Readonly<Record<"READ" | "WRITE", number>>,
  GPUShaderStage: Readonly<Record<"VERTEX" | "FRAGMENT" | "COMPUTE", number>>,
  GPUTextureUsage: Readonly<Record<"COPY_SRC" | "COPY_DST" | "TEXTURE_BINDING" | "STORAGE_BINDING" | "RENDER_ATTACHMENT", number>>
};

type HostframeGlobals = Omit<WebGPUGlobals, keyof GPUConstants> & GPUConstants;
const globals = dawn.globals as unknown as HostframeGlobals;

export const GPU: HostframeGlobals["GPU"] = globals.GPU;
export const GPUAdapter: HostframeGlobals["GPUAdapter"] = globals.GPUAdapter;
export const GPUAdapterInfo: HostframeGlobals["GPUAdapterInfo"] = globals.GPUAdapterInfo;
export const GPUBindGroup: HostframeGlobals["GPUBindGroup"] = globals.GPUBindGroup;
export const GPUBindGroupLayout: HostframeGlobals["GPUBindGroupLayout"] = globals.GPUBindGroupLayout;
export const GPUBuffer: HostframeGlobals["GPUBuffer"] = globals.GPUBuffer;
export const GPUBufferUsage: HostframeGlobals["GPUBufferUsage"] = globals.GPUBufferUsage;
export const GPUCanvasContext: HostframeGlobals["GPUCanvasContext"] = globals.GPUCanvasContext;
export const GPUColorWrite: HostframeGlobals["GPUColorWrite"] = globals.GPUColorWrite;
export const GPUCommandBuffer: HostframeGlobals["GPUCommandBuffer"] = globals.GPUCommandBuffer;
export const GPUCommandEncoder: HostframeGlobals["GPUCommandEncoder"] = globals.GPUCommandEncoder;
export const GPUCompilationInfo: HostframeGlobals["GPUCompilationInfo"] = globals.GPUCompilationInfo;
export const GPUCompilationMessage: HostframeGlobals["GPUCompilationMessage"] = globals.GPUCompilationMessage;
export const GPUComputePassEncoder: HostframeGlobals["GPUComputePassEncoder"] = globals.GPUComputePassEncoder;
export const GPUComputePipeline: HostframeGlobals["GPUComputePipeline"] = globals.GPUComputePipeline;
export const GPUDevice: HostframeGlobals["GPUDevice"] = globals.GPUDevice;
export const GPUDeviceLostInfo: HostframeGlobals["GPUDeviceLostInfo"] = globals.GPUDeviceLostInfo;
export const GPUError: HostframeGlobals["GPUError"] = globals.GPUError;
export const GPUExternalTexture: HostframeGlobals["GPUExternalTexture"] = globals.GPUExternalTexture;
export const GPUInternalError: HostframeGlobals["GPUInternalError"] = globals.GPUInternalError;
export const GPUMapMode: HostframeGlobals["GPUMapMode"] = globals.GPUMapMode;
export const GPUOutOfMemoryError: HostframeGlobals["GPUOutOfMemoryError"] = globals.GPUOutOfMemoryError;
export const GPUPipelineError: HostframeGlobals["GPUPipelineError"] = globals.GPUPipelineError;
export const GPUPipelineLayout: HostframeGlobals["GPUPipelineLayout"] = globals.GPUPipelineLayout;
export const GPUQuerySet: HostframeGlobals["GPUQuerySet"] = globals.GPUQuerySet;
export const GPUQueue: HostframeGlobals["GPUQueue"] = globals.GPUQueue;
export const GPURenderBundle: HostframeGlobals["GPURenderBundle"] = globals.GPURenderBundle;
export const GPURenderBundleEncoder: HostframeGlobals["GPURenderBundleEncoder"] = globals.GPURenderBundleEncoder;
export const GPURenderPassEncoder: HostframeGlobals["GPURenderPassEncoder"] = globals.GPURenderPassEncoder;
export const GPURenderPipeline: HostframeGlobals["GPURenderPipeline"] = globals.GPURenderPipeline;
export const GPUSampler: HostframeGlobals["GPUSampler"] = globals.GPUSampler;
export const GPUShaderModule: HostframeGlobals["GPUShaderModule"] = globals.GPUShaderModule;
export const GPUShaderStage: HostframeGlobals["GPUShaderStage"] = globals.GPUShaderStage;
export const GPUSupportedLimits: HostframeGlobals["GPUSupportedLimits"] = globals.GPUSupportedLimits;
export const GPUTexture: HostframeGlobals["GPUTexture"] = globals.GPUTexture;
export const GPUTextureUsage: HostframeGlobals["GPUTextureUsage"] = globals.GPUTextureUsage;
export const GPUTextureView: HostframeGlobals["GPUTextureView"] = globals.GPUTextureView;
export const GPUUncapturedErrorEvent: HostframeGlobals["GPUUncapturedErrorEvent"] = globals.GPUUncapturedErrorEvent;
export const GPUValidationError: HostframeGlobals["GPUValidationError"] = globals.GPUValidationError;
