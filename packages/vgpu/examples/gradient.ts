import { Application } from "hostframe";
import { createVgpuSurface } from "@hostframe/vgpu";
import { effect, frame } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";

const app = new Application();
const window = app.createWindow({
  title: "vgpu gradient",
  width: 800,
  height: 600
});
const vgpu = await createVgpuSurface(window);
const shader = effect(vgpu.gpu, prepareShader(`
  @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    return vec4f(uv, 0.5, 1.0);
  }
`));

try {
  window.on("render", () => {
    frame(vgpu.gpu, f => {
      f.pass(vgpu.surface, shader);
    });

    return undefined;
  });
  await app.run();
} finally {
  shader.dispose();
  vgpu.dispose();
  app.dispose();
  vgpu.device.destroy();
}
