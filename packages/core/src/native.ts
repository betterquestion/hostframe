import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { GPU, WebGPUGlobals } from "./webgpu-types.js";

const require = createRequire(import.meta.url);

export const dawnPath = fileURLToPath(new URL("../build/dawn/hostframe-dawn-linux-x64/dawn.node", import.meta.url));
export const dawn: {
  create(options: string[]): GPU,
  globals: Record<string, unknown> & Pick<WebGPUGlobals, "GPUTexture" | "GPUDevice">
} = require(dawnPath);

export const native = require("../build/native/hostframe.linux-x64-gnu.node") as typeof import("../build/native/native.js");
export type { NativeEvent, NativeMetrics } from "../build/native/native.js";
