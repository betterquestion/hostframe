import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const nativeBuild = "../core-native/build";
const dawn = "dawn/hostframe-dawn-linux-x64";

for(const file of [
  "native/hostframe.linux-x64-gnu.node",
  "native/native.d.ts",
  `${dawn}/dawn.node`,
  `${dawn}/metadata.json`,
  `${dawn}/licenses`
]) {
  cpSync(join(nativeBuild, file), join("build", file), { recursive: true });
}

mkdirSync("build/licenses", { recursive: true });
cpSync("../../LICENSE", "build/licenses/Hostframe.txt");
