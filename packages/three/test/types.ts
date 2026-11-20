import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import { PerspectiveCamera, Scene } from "three/webgpu";

async function render() {
  const app = new Application();
  const window = app.createWindow();
  const three = await createThreeRenderer(window);

  three.renderer.render(new Scene(), new PerspectiveCamera());
}

void render;
