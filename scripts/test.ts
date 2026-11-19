import { readdirSync } from "node:fs";
import { join } from "node:path";

const driver = process.env.VK_DRIVER_FILES ?? process.env.VK_ICD_FILENAMES ?? findSoftwareDriver();
const env = { ...process.env, VK_DRIVER_FILES: driver };

for(const runtime of ["node", process.execPath]) {
  const child = Bun.spawn(["timeout", "40s", "xvfb-run", "-a", runtime, "test/pilot.mjs"], {
    env,
    stdout: "inherit",
    stderr: "inherit"
  });
  const code = await child.exited;
  if(code !== 0) throw new Error(`Hostframe integration test failed in ${runtime} (exit ${code})`);
}

function findSoftwareDriver() {
  for(const directory of ["/usr/share/vulkan/icd.d", "/etc/vulkan/icd.d"]) {
    const name = readdirSync(directory, { throwIfNoEntry: false })
      ?.find(file => /^lvp_icd(?:\.x86_64)?\.json$/.test(file));
    if(name) return join(directory, name);
  }
  throw new Error("Install Mesa's software Vulkan driver or set VK_DRIVER_FILES to a working Vulkan ICD manifest");
}
