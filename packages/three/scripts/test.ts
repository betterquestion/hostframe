import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const software = "/usr/share/vulkan/icd.d/lvp_icd.x86_64.json";
const env = { ...process.env };

if(!env.VK_DRIVER_FILES && !env.VK_ICD_FILENAMES && existsSync(software)) {
  env.VK_DRIVER_FILES = software;
}

const runtime = process.env.HOSTFRAME_TEST_RUNTIME ?? "bun";

for(const test of ["test/render.ts", "test/resize.ts", "test/multiple.ts"]) {
  const result = spawnSync("xvfb-run", ["-a", "-n", "200", "-s", "-screen 0 1280x1024x24 -nolisten tcp -noreset -ac", runtime, test], { env, stdio: "inherit" });

  if(result.error) {
    throw result.error;
  }

  if(result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
