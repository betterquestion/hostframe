import { installWebGPUGlobals } from "hostframe";
import type { Window } from "hostframe";
import { initFromDevice, surface } from "vgpu";
import type { SurfaceOptions } from "vgpu";

/** Create a vgpu surface that renders directly to a Hostframe window. */
export async function createVgpuSurface(window: Window, options: Pick<SurfaceOptions, "depth" | "msaa" | "clearColor" | "label"> = {}) {
  installWebGPUGlobals();
  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No WebGPU adapter can present to this window");
  }

  const device = await adapter.requestDevice();
  let gpu: Awaited<ReturnType<typeof initFromDevice>> | undefined;

  try {
    gpu = await initFromDevice(device as unknown as GPUDevice);
    const metrics = window.metrics;
    const canvas = {
      width: Math.max(1, metrics.framebufferWidth),
      height: Math.max(1, metrics.framebufferHeight),
      getContext() {
        return context;
      }
    };
    const screen = surface(gpu, canvas as unknown as HTMLCanvasElement, {
      ...options,
      format: "bgra8unorm",
      alphaMode: "opaque",
      autoResize: false
    });
    const unsubscribe = window.on("metrics", ({ metrics }) => {
      if(metrics.drawable && (screen.size[0] !== metrics.framebufferWidth || screen.size[1] !== metrics.framebufferHeight)) {
        screen.resize([metrics.framebufferWidth, metrics.framebufferHeight]);
      }

      return undefined;
    });
    let disposed = false;
    const ownedGpu = gpu;

    return {
      gpu: ownedGpu,
      surface: screen,
      device,
      dispose() {
        if(disposed) {
          return;
        }

        disposed = true;
        unsubscribe();
        screen.dispose();
        ownedGpu.dispose();
      }
    };
  } catch (error) {
    gpu?.dispose();
    context.unconfigure();
    device.destroy();
    throw error;
  }
}
