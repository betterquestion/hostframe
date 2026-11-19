import assert from "node:assert/strict";
import { Application, gpu } from "hostframe";
import { gpu as globalsGpu, GPUBufferUsage } from "hostframe/globals";

assert.equal(typeof Application, "function");
assert.equal(gpu, globalsGpu);
assert.ok(GPUBufferUsage.COPY_SRC > 0);

const adapter = await gpu.requestAdapter();
assert.ok(adapter, "Expected a compatible WebGPU adapter from the installed package");
const device = await adapter.requestDevice();
device.destroy();
console.log(`Created a WebGPU device from the packed hostframe package in ${process.versions.bun ? "Bun" : "Node"}`);
