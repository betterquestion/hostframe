import { Application, installWebGPUGlobals } from "hostframe";
import { effect, frame } from "vgpu";
import { createVgpuSurface } from "@hostframe/vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { strict as assert } from "node:assert";
installWebGPUGlobals();
const app = new Application();
const window = app.createWindow({ width: 256, height: 256 });
const context = window.getContext("webgpu");
const integration = await createVgpuSurface(window, { depth: true });
const { gpu, device, surface: screen } = integration;
const shader = effect(gpu, prepareShader("@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(uv.x, uv.y, 0.5, 1.0); }"));
const buffers = [];
let renders = 0;
let resized = false;
const timeout = setTimeout(() => app.stop(), 5000);

try {
  assert.throws(() => context.getCurrentTexture(), /active window render/);
  window.on("render", () => {
    frame(gpu, f => {
      f.pass(screen, shader);
    });
    const { framebufferWidth: width, framebufferHeight: height } = window.metrics;

    if(renders === 0 || (width === 320 && height === 192)) {
      const pitch = Math.ceil(width * 4 / 256) * 256;
      const buffer = device.createBuffer({ size: pitch * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();

      enc.copyTextureToBuffer({ texture: context.getCurrentTexture() }, { buffer, bytesPerRow: pitch }, [width, height]);
      device.queue.submit([enc.finish()]);
      buffers.push({
        buffer,
        pitch,
        width,
        height
      });
      if(renders > 0) {
        resized = true;
        app.stop();
      }
    }

    if(++renders === 1) {
      setImmediate(() => window.setSize(320, 192));
    }
  });
  await app.run();
  assert(resized, "resize timed out");
  assert.deepEqual(screen.size, [320, 192]);
  for(const { buffer, pitch, width, height } of buffers) {
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buffer.getMappedRange());
    const p = bytes.slice(Math.floor(height / 2) * pitch + Math.floor(width / 2) * 4, Math.floor(height / 2) * pitch + Math.floor(width / 2) * 4 + 4);

    assert(p[0] > 110 && p[0] < 145 && p[1] > 100 && p[1] < 155 && p[2] > 100 && p[2] < 155, `unexpected BGRA ${p}`);
    const topLeft = bytes.slice(4 * 16 + 16 * pitch, 4 * 16 + 16 * pitch + 4);
    const bottomRight = bytes.slice(4 * (width - 16) + (height - 16) * pitch, 4 * (width - 16) + (height - 16) * pitch + 4);

    assert(bottomRight[1] > topLeft[1] + 100 && bottomRight[2] > topLeft[2] + 100, `gradient failed: ${topLeft}, ${bottomRight}`);
    console.log(`direct vgpu ${width}x${height}:`, p, topLeft, bottomRight);
    buffer.unmap();
  }

  integration.dispose();
  const probe = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

  device.queue.writeBuffer(probe, 0, new Uint32Array([42]));
  await probe.mapAsync(GPUMapMode.READ);
  assert.equal(new Uint32Array(probe.getMappedRange())[0], 42);
  probe.unmap();
  probe.destroy();
  console.log("Hostframe device remains usable after vgpu disposal");
} finally {
  clearTimeout(timeout);
  for(const { buffer } of buffers) {
    buffer.destroy();
  }

  shader.dispose();
  integration.dispose();
  app.dispose();
  device.destroy();
}
