import { dawn, dawnPath, native } from "./native.js";
import type { NativeEvent, NativeMetrics } from "./native.js";
import type { InputEvent, InputState, PresentMode, WindowOptions } from "./contracts.js";
import type { GPU, GPUAdapter, GPUCanvasConfiguration, GPUDevice, GPURequestAdapterOptions, GPUTexture, GPUTextureFormat } from "./webgpu-types.js";

export type { PresentMode, WindowOptions } from "./contracts.js";

export const gpu: GPU = dawn.create([]);
const destroyFrame = dawn.globals.GPUTexture.prototype.destroy;
const destroyDevice = dawn.globals.GPUDevice.prototype.destroy;

export function getProcessGPU(): GPU {
  return gpu;
}

/** Installs missing WebGPU globals; rejects foreign values and accessors before writing. */
export function installWebGPUGlobals() {
  const missing: PropertyDescriptorMap = {};

  for(const [name, value] of Object.entries(dawn.globals)) {
    let owner: object | null = globalThis;
    let descriptor: PropertyDescriptor | undefined;

    while(owner) {
      descriptor = Object.getOwnPropertyDescriptor(owner, name);
      if(descriptor) {
        break;
      }

      owner = Object.getPrototypeOf(owner);
    }

    if(descriptor) {
      if(!Object.hasOwn(descriptor, "value") || !Object.is(descriptor.value, value)) {
        throw new TypeError(`Conflicting WebGPU global: ${name}`);
      }
    } else {
      missing[name] = {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      };
    }
  }

  if(Object.keys(missing).length && !Object.isExtensible(globalThis)) {
    throw new TypeError("Cannot install WebGPU globals on a nonextensible globalThis");
  }

  Object.defineProperties(globalThis, missing);
}

export class NativeApplication {
  #session = new native.NativeSession();
  #windows = new Set<NativeWindow>();
  #operation?: string;
  disposed = false;

  get hasOpenWindows() {
    this.#checkOperation();

    return Array.from(this.#windows).some(window => window.open);
  }

  guard<T>(operation: string, callback: () => T) {
    this.#checkOperation();
    this.#operation = operation;
    try {
      return callback();
    } finally {
      this.#operation = undefined;
    }
  }

  #checkOperation() {
    if(this.disposed) {
      throw new Error("Application is disposed");
    }

    if(this.#operation) {
      throw new Error(`A native operation is in progress (${this.#operation})`);
    }
  }

  pollEvents() {
    this.guard("pollEvents", () => this.#session.poll());
  }

  createWindow(gpu: GPU, options: WindowOptions = {}) {
    return this.guard("createWindow", () => {
      const window = new NativeWindow(this, gpu, options, () => {
        this.#windows.delete(window);
      });

      this.#windows.add(window);

      return window;
    });
  }

  getKeyLabel(key: number, scancode: number) {
    return this.guard("getKeyLabel", () => this.#session.getKeyLabel(key, scancode));
  }

  getKeyScancode(key: number) {
    return this.guard("getKeyScancode", () => this.#session.getKeyScancode(key));
  }

  dispose() {
    if(this.disposed) {
      return;
    }

    this.#checkOperation();
    const errors: unknown[] = [];

    for(const window of this.#windows) {
      try {
        window.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    this.disposed = true;
    this.#session.dispose();
    if(errors.length === 1) {
      throw errors[0];
    }

    if(errors.length) {
      throw new AggregateError(errors, "Hostframe window cleanup failed");
    }
  }
}

export class NativeWindow {
  #handle: InstanceType<typeof native.NativeWindow>;
  #app: NativeApplication;
  #gpu: GPU;
  #metrics?: NativeMetrics;
  #remove: () => void;
  #device?: GPUDevice;
  #presentMode?: PresentMode;
  disposed = false;
  #closed = false;

  get open() {
    return !this.#closed;
  }

  get shouldClose() {
    return this.#guard("shouldClose", () => this.#closed);
  }

  constructor(app: NativeApplication, gpu: GPU, options: WindowOptions, remove: () => void) {
    if(!options || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("Expected window options object");
    }

    const { title = "hostframe solid color", width = 320, height = 240, resizable = false, vsync = true } = options;

    requireTitle(title);
    requireInt(width, "width", 1);
    requireInt(height, "height", 1);
    requireBoolean(resizable, "resizable");
    requireBoolean(vsync, "vsync");
    this.#handle = new native.NativeWindow(dawnPath, gpu, {
      title,
      width,
      height,
      resizable,
      vsync
    });
    this.#app = app;
    this.#gpu = gpu;
    this.#remove = remove;
  }

  get configured() {
    return this.#device !== undefined;
  }

  get presentMode() {
    return this.#guard("presentMode", () => {
      if(!this.#presentMode) {
        throw new Error("Surface is not configured");
      }

      return this.#presentMode;
    });
  }

  #guard<T>(operation: string, callback: () => T) {
    if(this.disposed) {
      throw new Error("Window is disposed");
    }

    return this.#app.guard(operation, callback);
  }

  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null> {
    return this.#guard("requestAdapter", () => this.#handle.requestAdapter(this.#gpu, options) as Promise<GPUAdapter | null>);
  }

  configure(configuration: GPUCanvasConfiguration): NormalizedConfiguration {
    return this.#guard("configure", () => {
      const normalized = normalizeConfiguration(configuration);

      try {
        this.#presentMode = this.#handle.configure(normalized.device, {
          format: normalized.format,
          usage: normalized.usage,
          alphaMode: normalized.alphaMode,
          viewFormats: normalized.viewFormats
        }, () => normalized.device.limits.maxTextureDimension2D, this.#destroyDevice) as PresentMode;
      } finally {
        if(!this.#handle.configured()) {
          this.#clearConfiguration();
        }
      }

      this.#device = normalized.device;

      return normalized;
    });
  }

  unconfigure() {
    this.#guard("unconfigure", () => {
      try {
        this.#handle.unconfigure(this.#destroyDevice);
      } finally {
        if(!this.#handle.configured()) {
          this.#clearConfiguration();
        }
      }
    });
  }

  #destroyDevice = () => {
    if(this.#device) {
      destroyDevice.call(this.#device);
    }
  };

  #clearConfiguration() {
    this.#device = undefined;
    this.#presentMode = undefined;
  }

  renderFrame(callback: (texture: GPUTexture) => undefined) {
    this.#guard("render", () => {
      if(this.#closed) {
        throw new Error("Window close requested");
      }

      if(!this.#device) {
        throw new Error("Context is not configured");
      }

      const frame = this.#handle.acquire(this.#device) as GPUTexture | null;

      if(!frame) {
        return;
      }

      try {
        const result: unknown = callback(frame);

        if(result !== undefined) {
          void Promise.resolve(result).catch(() => { });
          throw new TypeError("Frame callback must return undefined synchronously");
        }

        this.#handle.present();
      } catch (error) {
        this.#handle.discardFrame();
        throw error;
      } finally {
        // Dawn exposes explicit destruction on the genuine surface texture.
        destroyFrame.call(frame);
      }
    });
  }

  dispatchInput(callback: (state: InputState, events: InputEvent[]) => undefined) {
    this.#guard("input dispatch", () => {
      const { state, events } = this.#handle.takeEvents();
      const decoded = events.map(decodeEvent);

      if(!this.#metrics || Object.keys(state.metrics).some(key => {
        const field = key as keyof NativeMetrics;

        return this.#metrics?.[field] !== state.metrics[field];
      })) {
        this.#metrics = state.metrics;
        decoded.unshift({ type: "metrics", metrics: state.metrics });
      }

      callback(state, decoded);
    });
  }

  requestClose() {
    return this.#guard("requestClose", () => {
      const state = this.#handle.requestClose();

      this.#closed = true;

      return state;
    });
  }

  setPointerCapture(captured: boolean, rawMotion: boolean) {
    return this.#guard("setPointerCapture", () => {
      requireBoolean(captured, "captured");
      requireBoolean(rawMotion, "rawMotion");

      return this.#handle.setPointerCapture(captured, rawMotion);
    });
  }

  setTitle(title: string) {
    this.#guard("setTitle", () => {
      requireTitle(title); this.#handle.setTitle(title);
    });
  }

  setSize(width: number, height: number) {
    this.#guard("setSize", () => {
      requireInt(width, "Size width", 1);
      requireInt(height, "Size height", 1);
      this.#handle.setSize(width, height);
    });
  }

  setPosition(x: number, y: number) {
    this.#guard("setPosition", () => {
      requireInt(x, "Position x");
      requireInt(y, "Position y");
      this.#handle.setPosition(x, y);
    });
  }

  setFullscreen(fullscreen: boolean) {
    this.#guard("setFullscreen", () => {
      requireBoolean(fullscreen, "fullscreen");
      this.#handle.setFullscreen(fullscreen);
    });
  }

  setVisible(visible: boolean) {
    this.#guard("setVisible", () => {
      requireBoolean(visible, "visible");
      this.#handle.setVisible(visible);
    });
  }

  dispose() {
    if(this.disposed) {
      return;
    }

    this.#guard("dispose", () => {
      try {
        this.#handle.close(this.#destroyDevice);
      } finally {
        this.disposed = true;
        this.#closed = true;
        this.#clearConfiguration();
        this.#remove();
      }
    });
  }
}

function requireTitle(title: string) {
  if(typeof title !== "string" || title.includes("\0")) {
    throw new TypeError("Window title must be a string without null characters");
  }
}

function requireBoolean(value: boolean, name: string) {
  if(typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean`);
  }
}

function requireInt(value: number, name: string, minimum = -0x80000000) {
  const description = minimum === 1 ? "a positive 32-bit integer" : "a signed 32-bit integer";

  if(typeof value !== "number") {
    throw new TypeError(`${name} must be a number (${description})`);
  }

  if(!Number.isInteger(value) || value < minimum || value > 0x7fffffff) {
    throw new RangeError(`${name} must be ${description}`);
  }
}

function decodeEvent({ kind, values }: NativeEvent): InputEvent {
  const [a, b, c, d, e] = values;

  switch(kind) {
    case "closeRequest":
    case "minimize":
    case "restore": return { type: kind };
    case "focus": return { type: kind, focused: Boolean(a) };
    case "key": return {
      type: kind,
      key: a,
      scancode: b,
      action: c === 0 ? "release" : c === 1 ? "press" : "repeat",
      modifiers: d,
      synthetic: Boolean(e)
    };
    case "text": return { type: kind, codepoint: a };
    case "pointerButton": return {
      type: kind,
      button: a,
      action: b === 0 ? "release" : "press",
      modifiers: c,
      synthetic: Boolean(d)
    };
    case "pointerMove": return {
      type: kind,
      x: a,
      y: b,
      deltaX: c,
      deltaY: d,
      captured: Boolean(e)
    };
    case "scroll": return {
      type: kind,
      deltaX: a,
      deltaY: b
    };
    case "pointerCapture": return {
      type: kind,
      captured: Boolean(a),
      rawMotion: Boolean(b)
    };
    default: throw new Error(`Unexpected native window event: ${kind}`);
  }
}

type NormalizedConfiguration = {
  device: GPUDevice,
  format: GPUTextureFormat,
  usage: number,
  alphaMode: "opaque" | "premultiplied",
  viewFormats: GPUTextureFormat[],
  colorSpace: "srgb",
  toneMapping: { mode: "standard" }
};

function normalizeConfiguration(configuration: GPUCanvasConfiguration): NormalizedConfiguration {
  if(!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new TypeError("Expected a canvas configuration object");
  }

  const device = configuration.device;
  const format = String(configuration.format) as GPUTextureFormat;
  const usage = Number(configuration.usage ?? 0x10);

  if(!Number.isInteger(usage) || usage <= 0 || usage > 0xffffffff) {
    throw new TypeError("Invalid surface usage");
  }

  const viewFormats = Array.from(configuration.viewFormats ?? [], format => String(format) as GPUTextureFormat);
  const colorSpace = String(configuration.colorSpace ?? "srgb");
  const toneMapping = configuration.toneMapping;
  const mode = String(toneMapping?.mode ?? "standard");

  if(colorSpace !== "srgb" || mode !== "standard") {
    throw new TypeError("Only srgb colorSpace and standard toneMapping are supported");
  }

  const alphaMode = String(configuration.alphaMode ?? "opaque");

  if(alphaMode !== "opaque" && alphaMode !== "premultiplied") {
    throw new TypeError("Unsupported alphaMode");
  }

  return {
    device,
    format,
    usage,
    alphaMode,
    viewFormats,
    colorSpace,
    toneMapping: { mode }
  } satisfies GPUCanvasConfiguration;
}
