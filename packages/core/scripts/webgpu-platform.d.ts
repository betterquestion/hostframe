export type PredefinedColorSpace = "display-p3" | "srgb";

type PlatformInstance<Name extends string, Fallback = never> =
  typeof globalThis extends Record<Name, { prototype: infer Instance }> ? Instance : Fallback;

type BufferSource = ArrayBuffer | ArrayBufferView;
type DOMException = PlatformInstance<"DOMException", Error>;
type Event = PlatformInstance<"Event", { readonly type: string }>;
type EventTarget = PlatformInstance<"EventTarget", { dispatchEvent(event: Event): boolean }>;
type HTMLCanvasElement = PlatformInstance<"HTMLCanvasElement">;
type HTMLImageElement = PlatformInstance<"HTMLImageElement">;
type HTMLVideoElement = PlatformInstance<"HTMLVideoElement">;
type ImageBitmap = PlatformInstance<"ImageBitmap">;
type ImageData = PlatformInstance<"ImageData">;
type OffscreenCanvas = PlatformInstance<"OffscreenCanvas">;
type VideoFrame = PlatformInstance<"VideoFrame">;

type EventInit = { bubbles?: boolean, cancelable?: boolean, composed?: boolean };
type EventListenerOptions = { capture?: boolean };
type AddEventListenerOptions = EventListenerOptions & {
  once?: boolean,
  passive?: boolean,
  signal?: PlatformInstance<"AbortSignal">
};
type EventListenerOrEventListenerObject = ((event: Event) => void) | { handleEvent(event: Event): void };
