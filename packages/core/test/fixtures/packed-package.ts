import assert from "node:assert/strict";
import { Application, gpu } from "hostframe";
import { gpu as globalsGpu, GPUBufferUsage } from "hostframe/globals";

const runtime = process.versions.bun ? "Bun" : "Node";

if(process.argv[2]) {
  assert.equal(runtime, process.argv[2]);
}

assert.equal(typeof Application, "function");
assert.equal(gpu, globalsGpu);
assert.ok(GPUBufferUsage.COPY_SRC > 0);

const adapter = await gpu.requestAdapter();

assert.ok(adapter, "Expected a compatible WebGPU adapter from the installed package");
const device = await adapter.requestDevice();

device.destroy();
console.log(`Created a WebGPU device from the packed hostframe package in ${runtime}`);
