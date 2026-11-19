// Values and literal types are generated from the GLFW header used by the native build.
export { Key, PointerButton, Modifier } from "./glfw-input.js";

import { KeyName } from "./glfw-input.js";

/** Canonical symbolic name, including UNKNOWN for Key.UNKNOWN; undefined for unrecognized values. */
export function getKeyName(key: number) {
  return Object.hasOwn(KeyName, key) ? KeyName[key] : undefined;
}
