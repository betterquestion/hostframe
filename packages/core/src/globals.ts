import { dawn } from "./native.js";
export { gpu } from "./bridge.js";

type GPUConstants = {
  GPUBufferUsage: Readonly<Record<"MAP_READ" | "MAP_WRITE" | "COPY_SRC" | "COPY_DST" | "INDEX" | "VERTEX" | "UNIFORM" | "STORAGE" | "INDIRECT" | "QUERY_RESOLVE", number>>,
  GPUColorWrite: Readonly<Record<"RED" | "GREEN" | "BLUE" | "ALPHA" | "ALL", number>>,
  GPUMapMode: Readonly<Record<"READ" | "WRITE", number>>,
  GPUShaderStage: Readonly<Record<"VERTEX" | "FRAGMENT" | "COMPUTE", number>>,
  GPUTextureUsage: Readonly<Record<"COPY_SRC" | "COPY_DST" | "TEXTURE_BINDING" | "STORAGE_BINDING" | "RENDER_ATTACHMENT", number>>
};

export const {
  GPU,
  GPUAdapter,
  GPUAdapterInfo,
  GPUBindGroup,
  GPUBindGroupLayout,
  GPUBuffer,
  GPUBufferUsage,
  GPUCanvasContext,
  GPUColorWrite,
  GPUCommandBuffer,
  GPUCommandEncoder,
  GPUCompilationInfo,
  GPUCompilationMessage,
  GPUComputePassEncoder,
  GPUComputePipeline,
  GPUDevice,
  GPUDeviceLostInfo,
  GPUError,
  GPUExternalTexture,
  GPUInternalError,
  GPUMapMode,
  GPUOutOfMemoryError,
  GPUPipelineError,
  GPUPipelineLayout,
  GPUQuerySet,
  GPUQueue,
  GPURenderBundle,
  GPURenderBundleEncoder,
  GPURenderPassEncoder,
  GPURenderPipeline,
  GPUSampler,
  GPUShaderModule,
  GPUShaderStage,
  GPUSupportedLimits,
  GPUTexture,
  GPUTextureUsage,
  GPUTextureView,
  GPUUncapturedErrorEvent,
  GPUValidationError
} = dawn.globals as unknown as typeof globalThis & GPUConstants;
