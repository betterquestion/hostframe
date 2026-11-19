import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const dawnPath = fileURLToPath(new URL("../build/dawn/hostframe-dawn-linux-x64/dawn.node", import.meta.url));
export const dawn = require(dawnPath) as {
  create(options: string[]): GPU,
  globals: Record<string, unknown> & { GPUTexture: typeof GPUTexture, GPUDevice: typeof GPUDevice }
};

export const native = require("../build/native/hostframe.linux-x64-gnu.node") as typeof import("../build/native/native.js");
export type { NativeEvent, NativeMetrics } from "../build/native/native.js";
