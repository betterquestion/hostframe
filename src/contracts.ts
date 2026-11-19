export type WindowOptions = {
  title?: string,
  width?: number,
  height?: number,
  resizable?: boolean,
  vsync?: boolean
};
export type WindowMetrics = Readonly<{
  width: number,
  height: number,
  framebufferWidth: number,
  framebufferHeight: number,
  contentScaleX: number,
  contentScaleY: number,
  drawable: boolean
}>;
export type MetricsEvent = Readonly<{
  type: "metrics",
  metrics: WindowMetrics
}>;
export type InputState = Readonly<{
  metrics: WindowMetrics,
  status: WindowStatus,
  keys: readonly number[],
  scancodes: readonly number[],
  buttons: readonly number[],
  focused: boolean,
  pointerCaptured: boolean,
  rawMotion: boolean,
  x: number,
  y: number
}>;
export type WindowStatus = Readonly<{
  x: number,
  y: number,
  visible: boolean,
  minimized: boolean
}>;
export type CloseRequestEvent = Readonly<{
  type: "closeRequest"
}>;
export type MinimizeEvent = Readonly<{
  type: "minimize"
}>;
export type RestoreEvent = Readonly<{
  type: "restore"
}>;
export type KeyEvent = Readonly<{
  type: "key",
  key: number,
  scancode: number,
  action: "press" | "release" | "repeat",
  modifiers: number,
  synthetic: boolean
}>;
export type TextEvent = Readonly<{
  type: "text",
  codepoint: number
}>;
export type PointerMoveEvent = Readonly<{
  type: "pointerMove",
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
  captured: boolean
}>;
export type PointerButtonEvent = Readonly<{
  type: "pointerButton",
  button: number,
  action: "press" | "release",
  modifiers: number,
  synthetic: boolean
}>;
export type ScrollEvent = Readonly<{
  type: "scroll",
  deltaX: number,
  deltaY: number
}>;
export type FocusEvent = Readonly<{
  type: "focus",
  focused: boolean
}>;
export type PointerCaptureEvent = Readonly<{
  type: "pointerCapture",
  captured: boolean,
  rawMotion: boolean
}>;
export type PresentMode = "fifo" | "immediate" | "mailbox";
export type InputEvent = CloseRequestEvent | MinimizeEvent | RestoreEvent | MetricsEvent | KeyEvent | TextEvent | PointerMoveEvent | PointerButtonEvent | ScrollEvent | FocusEvent | PointerCaptureEvent;

export const inputEventTypes = Object.freeze(["closeRequest", "minimize", "restore", "metrics", "key", "text", "pointerMove", "pointerButton", "scroll", "focus", "pointerCapture"] as const);
