import { dawnPath, native } from "./native.js";
import type { NativeEvent, NativeWindow } from "./native.js";

export interface WindowOptions {
  title?: string,
  width?: number,
  height?: number,
  resizable?: boolean
}

export type WindowEvent =
  | { kind: "close" }
  | { kind: "resize", width: number, height: number }
  | { kind: "focus", focused: boolean }
  | { kind: "key", key: number, scancode: number, action: number, modifiers: number }
  | { kind: "text", text: string }
  | { kind: "pointerButton", button: number, action: number, modifiers: number }
  | { kind: "pointerMove" | "scroll", x: number, y: number };

export interface WindowContext {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>,
  configure(configuration: Pick<GPUCanvasConfiguration, "device" | "format">): void,
  getCurrentTexture(): GPUTexture
}

type WindowListeners = {
  render: () => void,
  event: (event: WindowEvent) => void
};

export class Window {
  readonly #native: NativeWindow;
  readonly #context: WindowContext;
  #device?: GPUDevice;
  #frame?: GPUTexture;
  #closing = false;
  #closed = false;
  #renderListeners = new Set<WindowListeners["render"]>();
  #eventListeners = new Set<WindowListeners["event"]>();

  constructor(gpu: GPU, options: WindowOptions = {}) {
    const { title = "Hostframe", width = 800, height = 600, resizable = true } = options;
    for(const dimension of [width, height]) {
      if(!Number.isInteger(dimension) || dimension < 1 || dimension > 0x7fffffff) {
        throw new RangeError("Window dimensions must be positive 32-bit integers");
      }
    }
    this.#native = new native.NativeWindow(dawnPath, gpu, { title, width, height, resizable });
    this.#context = {
      requestAdapter: options => this.#native.requestAdapter(gpu, options) as Promise<GPUAdapter | null>,
      configure: ({ device, format }) => {
        this.#native.configure(device, format);
        this.#device = device;
      },
      getCurrentTexture: () => {
        if(!this.#frame) throw new Error("The current texture is only available during rendering");
        return this.#frame;
      }
    };
  }

  get closed() {
    return this.#closed;
  }

  getContext(kind: "webgpu") {
    if(kind !== "webgpu") throw new TypeError("Hostframe supports only the webgpu context");
    return this.#context;
  }

  on(kind: "render", listener: WindowListeners["render"]): () => void;
  on(kind: "event", listener: WindowListeners["event"]): () => void;
  on(kind: keyof WindowListeners, listener: WindowListeners[keyof WindowListeners]) {
    if(kind === "render") {
      const render = listener as WindowListeners["render"];
      this.#renderListeners.add(render);
      return () => this.#renderListeners.delete(render);
    }
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  close() {
    if(this.#closed) return;
    if(this.#frame) {
      this.#closing = true;
      return;
    }
    this.#closed = true;
    this.#native.close();
  }

  /** @internal */
  step() {
    if(this.#closed) return;
    for(const nativeEvent of this.#native.poll()) {
      const event = decodeEvent(nativeEvent);
      for(const listener of Array.from(this.#eventListeners)) listener(event);
      if(event.kind === "close") this.close();
      if(this.#closed) return;
    }
    if(!this.#device || this.#renderListeners.size === 0) return;
    const texture = this.#native.acquire(this.#device) as GPUTexture | null;
    if(!texture) return;
    this.#frame = texture;
    try {
      try {
        for(const listener of Array.from(this.#renderListeners)) {
          if(listener() !== undefined) throw new TypeError("Render callbacks must return undefined synchronously");
        }
      } catch (error) {
        this.#native.discardFrame();
        throw error;
      }
      this.#native.present();
    } finally {
      this.#frame = undefined;
      if(this.#closing) this.close();
    }
  }
}

function decodeEvent({ kind, values, text }: NativeEvent): WindowEvent {
  const [first, second, third, fourth] = values;
  switch(kind) {
    case "close": return { kind };
    case "resize": return { kind, width: first, height: second };
    case "focus": return { kind, focused: Boolean(first) };
    case "key": return { kind, key: first, scancode: second, action: third, modifiers: fourth };
    case "text": return { kind, text: text ?? "" };
    case "pointerButton": return { kind, button: first, action: second, modifiers: third };
    case "pointerMove":
    case "scroll": return { kind, x: first, y: second };
    default: throw new Error(`Unexpected native window event: ${kind}`);
  }
}
