import { strict as assert } from "node:assert";
import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import { BoxGeometry, Mesh, MeshNormalMaterial, PerspectiveCamera, Scene } from "three/webgpu";

const app = new Application();
const window = app.createWindow({ width: 256, height: 256 });
const three = await createThreeRenderer(window);
const geometry = new BoxGeometry();
const material = new MeshNormalMaterial();
const scene = new Scene();
const camera = new PerspectiveCamera(50, 1, 0.1, 100);

camera.position.z = 3;
scene.add(new Mesh(geometry, material));
const device = three.device;
const buffer = device.createBuffer({ size: 256 * 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
let frames = 0;

try {
  window.on("render", () => {
    three.renderer.render(scene, camera);
    if(++frames === 2) {
      const encoder = device.createCommandEncoder();

      encoder.copyTextureToBuffer({ texture: window.getContext("webgpu").getCurrentTexture() }, { buffer, bytesPerRow: 1024 }, [256, 256]);
      device.queue.submit([encoder.finish()]);
      app.stop();
    }
  });
  await app.run();
  assert.equal(frames, 2);
  await buffer.mapAsync(GPUMapMode.READ);
  const pixels = new Uint8Array(buffer.getMappedRange());
  const center = pixels.slice((128 * 256 + 128) * 4, (128 * 256 + 128) * 4 + 3);
  const corner = pixels.slice(0, 3);

  assert(center.some(value => value > 60), `center is blank: ${center}`);
  assert(corner.every(value => value < 20), `background is unexpected: ${corner}`);
  console.log("Three.js rendered cube; center", center, "background", corner);
  buffer.unmap();
} finally {
  buffer.destroy();
  geometry.dispose();
  material.dispose();
  three.dispose();
  app.dispose();
  device.destroy();
}
