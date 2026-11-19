import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const archive = resolve(process.argv[2] ?? process.env.HOSTFRAME_DAWN_ARCHIVE ?? "../hostframe-dawn/build/hosted-artifacts/44427264780/hostframe-dawn-linux-x64.tar.gz");
const expected = "17a6df9d97b728fde6c7f9573a1f8b2a69377b6a6634111faca3abfc73dc58f1";
const destination = resolve("build/dawn");

installDawn();

function installDawn() {
  if(process.platform !== "linux" || process.arch !== "x64") throw new Error("The pilot requires Linux x86-64");
  if(createHash("sha256").update(readFileSync(archive)).digest("hex") !== expected) {
    throw new Error(`Dawn archive checksum mismatch for ${archive}`);
  }

  if(dawnIsInstalled()) return;
  mkdirSync(dirname(destination), { recursive: true });
  const staging = mkdtempSync(`${destination}-`);
  try {
    execFileSync("tar", ["-xzf", archive, "-C", staging]);
    writeFileSync(resolve(staging, ".sha256"), expected);
    try {
      renameSync(staging, destination);
    } catch (error) {
      if(!dawnIsInstalled()) throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function dawnIsInstalled() {
  if(!existsSync(destination)) return false;
  const marker = resolve(destination, ".sha256");
  if(existsSync(marker) && readFileSync(marker, "utf8") === expected) return true;
  throw new Error(`Remove the stale Dawn extraction at ${destination} and rerun setup`);
}
