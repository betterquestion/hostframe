import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import { BoxGeometry, Mesh, MeshNormalMaterial, PerspectiveCamera, Scene } from "three/webgpu";

const app = new Application();
const window = app.createWindow({
  title: "Hostframe Three.js cube",
  width: 800,
  height: 600
});
let three: Awaited<ReturnType<typeof createThreeRenderer>> | undefined;
const geometry = new BoxGeometry();
const material = new MeshNormalMaterial();

try {
  three = await createThreeRenderer(window, { antialias: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100);

  camera.position.z = 3;
  const cube = new Mesh(geometry, material);

  scene.add(cube);
  window.on("render", ({ frameTime }) => {
    const { framebufferWidth, framebufferHeight } = window.metrics;

    camera.aspect = framebufferWidth / framebufferHeight;
    camera.updateProjectionMatrix();
    cube.rotation.x += frameTime * 0.5;
    cube.rotation.y += frameTime;
    three!.renderer.render(scene, camera);
  });
  await app.run();
} finally {
  geometry.dispose();
  material.dispose();
  three?.dispose();
  app.dispose();
  three?.device.destroy();
}
