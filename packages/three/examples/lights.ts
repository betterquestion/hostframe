import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import { AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, Vector3 } from "three/webgpu";

const app = new Application();
const window = app.createWindow({
  width: 800,
  height: 600,
  title: "Hostframe Three.js lights"
});
const geometry = new SphereGeometry(0.9, 48, 32);
const material = new MeshStandardMaterial({
  color: 0x3299ed,
  roughness: 0.28,
  metalness: 0.35
});
let three: Awaited<ReturnType<typeof createThreeRenderer>> | undefined;

try {
  three = await createThreeRenderer(window, { antialias: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 100);

  camera.position.z = 4;
  scene.add(new Mesh(geometry, material));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const light = new DirectionalLight(0xffffff, 3);

  light.position.set(2, 3, 4);
  scene.add(light);
  const axis = new Vector3(0, 1, 0);

  window.on("render", ({ frameTime }) => {
    light.position.applyAxisAngle(axis, frameTime * 0.5);
    const { framebufferWidth, framebufferHeight } = window.metrics;

    camera.aspect = framebufferWidth / framebufferHeight;
    camera.updateProjectionMatrix();
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
