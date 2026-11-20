import { Application } from "hostframe";
import { createVgpuSurface } from "@hostframe/vgpu";
import { effect, frame } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";

const app = new Application();
const window = app.createWindow({
  title: "vgpu animation",
  width: 640,
  height: 480
});
const vgpu = await createVgpuSurface(window, { msaa: true });
const shader = effect(vgpu.gpu, prepareShader(`
  struct Params { time: f32 }
  @group(0) @binding(0) var<uniform> params: Params;
  @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    let wave = 0.5 + 0.5 * sin(uv.x * 12.0 + params.time);
    return vec4f(wave, uv.y, 1.0 - wave, 1.0);
  }
`), { set: { params: { time: 0 } } });
let time = 0;

try {
  window.on("render", ({ frameTime }) => {
    time += frameTime;
    shader.set({ params: { time } });
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
