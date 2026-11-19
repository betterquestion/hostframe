import { setTimeout as delay } from "node:timers/promises";
import { dawn } from "./native.js";
import { Window } from "./window.js";
import type { WindowOptions } from "./window.js";

export type { Window, WindowContext, WindowEvent, WindowOptions } from "./window.js";

export function installWebGPUGlobals() {
  Object.assign(globalThis, dawn.globals);
}

export class Application {
  readonly gpu: GPU;
  #windows = new Set<Window>();
  #running = false;
  #disposed = false;

  constructor() {
    this.gpu = dawn.create(["backend=vulkan"]);
  }

  createWindow(options?: WindowOptions) {
    if(this.#disposed) throw new Error("Hostframe application is disposed");
    const window = new Window(this.gpu, options);
    this.#windows.add(window);
    return window;
  }

  async run() {
    if(this.#running) throw new Error("Hostframe application is already running");
    this.#running = true;
    try {
      while(this.#windows.size > 0) {
        for(const window of this.#windows) {
          window.step();
          if(window.closed) this.#windows.delete(window);
        }
        if(this.#windows.size > 0) await delay(1);
      }
    } finally {
      this.#running = false;
    }
  }

  dispose() {
    this.#disposed = true;
    const errors: unknown[] = [];
    for(const window of this.#windows) {
      try {
        window.close();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#windows.clear();
    if(errors.length > 0) throw new AggregateError(errors, "Could not close every Hostframe window cleanly");
  }
}
