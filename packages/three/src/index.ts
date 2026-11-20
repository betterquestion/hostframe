import { installWebGPUGlobals } from "hostframe";
import { GPUTextureUsage } from "hostframe/globals";
import type { GPUDevice as HostframeGPUDevice, Window } from "hostframe";
import { UnsignedByteType, WebGPURenderer } from "three/webgpu";

export type ThreeRenderer = {
  renderer: WebGPURenderer,
  device: HostframeGPUDevice,
  dispose(): void
};

/** Creates a Three.js renderer for a Hostframe window. Dispose the renderer, then
 * the application, then destroy the returned device. */
export async function createThreeRenderer(window: Window, options: { antialias?: boolean } = {}): Promise<ThreeRenderer> {
  installWebGPUGlobals();
  const context = window.getContext("webgpu");
  const adapter = await context.requestAdapter();

  if(!adapter) {
    throw new Error("No WebGPU adapter can present to this window");
  }

  const device = await adapter.requestDevice();
  const metrics = window.metrics;
  const canvas = { width: Math.max(1, metrics.framebufferWidth), height: Math.max(1, metrics.framebufferHeight) };
  const facade = {
    configure(configuration: GPUCanvasConfiguration) {
      if(configuration.device !== device || configuration.format !== "bgra8unorm") {
        throw new Error("Three.js requested an incompatible surface configuration");
      }
    },
    getCurrentTexture() {
      return context.getCurrentTexture();
    }
  };
  const renderer = new WebGPURenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: facade as unknown as GPUCanvasContext,
    device: device as unknown as GPUDevice,
    outputType: UnsignedByteType,
    alpha: false,
    antialias: options.antialias ?? false
  });
  let nextFrame: ((time: number) => void) | undefined;
  let unsubscribeRender: (() => void) | undefined;
  let unsubscribeMetrics: (() => void) | undefined;

  try {
    context.configure({
      device,
      format: "bgra8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      alphaMode: "opaque"
    });
    // Three r186 and earlier start scheduling inside init(), before it resolves.
    // Intercept the renderer's own animation assignment so each renderer gets
    // its scheduler before start(), without changing process-wide globals.
    const scheduler = {
      requestAnimationFrame(callback: (time: number) => void) {
        nextFrame = callback;

        return 1;
      },
      cancelAnimationFrame() {
        nextFrame = undefined;
      }
    };
    const internals = renderer as unknown as { _animation: { setContext(value: object): void } | null };
    const descriptor = Object.getOwnPropertyDescriptor(renderer, "_animation");
    let animation = internals._animation;

    if(!descriptor || !descriptor.configurable || !Object.hasOwn(descriptor, "value")) {
      throw new Error("Unsupported Three.js animation initialization");
    }

    Object.defineProperty(renderer, "_animation", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return animation;
      },
      set(value: typeof animation) {
        animation = value;
        value?.setContext(scheduler);
      }
    });
    try {
      await renderer.init();
    } finally {
      Object.defineProperty(renderer, "_animation", { ...descriptor, value: animation });
    }

    if(!animation) {
      throw new Error("Three.js did not initialize its animation scheduler");
    }

    renderer.setSize(canvas.width, canvas.height, false);
    renderer.getContext();
    unsubscribeRender = window.on("render", () => {
      nextFrame?.(performance.now());
    });
    unsubscribeMetrics = window.on("metrics", event => {
      const { framebufferWidth, framebufferHeight, drawable } = event.metrics;

      if(drawable && (canvas.width !== framebufferWidth || canvas.height !== framebufferHeight)) {
        renderer.setSize(framebufferWidth, framebufferHeight, false);
      }
    });
  } catch (error) {
    unsubscribeRender?.();
    unsubscribeMetrics?.();
    renderer.dispose();
    context.unconfigure();
    device.destroy();
    throw error;
  }

  let disposed = false;

  return {
    renderer,
    device,
    dispose() {
      if(disposed) {
        return;
      }

      disposed = true;
      unsubscribeRender?.();
      unsubscribeMetrics?.();
      renderer.dispose();
      context.unconfigure();
    }
  };
}
