import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const releaseTag = "linux-x64-4a5a2fca50314566a37d34b698eb5263e3a83fb4";
const archiveName = "hostframe-dawn-linux-x64.tar.gz";
const releaseURL = `https://github.com/betterquestion/hostframe-dawn/releases/download/${releaseTag}/${archiveName}`;
const expected = "03102f9ae27864573e0d0b0be5126e25d99a3fc793fb260442567f3a152e4bbc";
const override = process.argv[2] ? resolve(process.argv[2]) : process.env.HOSTFRAME_DAWN_ARCHIVE;
const archive = resolve(root, override ?? `build/dawn-artifacts/${releaseTag}/${archiveName}`);
const destination = fileURLToPath(new URL("../build/dawn", import.meta.url));

await installDawn();

async function installDawn() {
  if(process.platform !== "linux" || process.arch !== "x64") throw new Error("The pilot requires Linux x86-64");
  if(override !== undefined || existsSync(archive)) {
    verifyArchive(readFileSync(archive), archive);
  } else {
    await downloadArchive();
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

async function downloadArchive() {
  console.log(`Downloading Dawn from ${releaseTag}`);
  const response = await fetch(releaseURL);
  if(!response.ok) throw new Error(`Dawn download failed (HTTP ${response.status}) for ${releaseURL}`);
  const contents = new Uint8Array(await response.arrayBuffer());
  verifyArchive(contents, releaseURL);

  const cache = dirname(archive);
  mkdirSync(cache, { recursive: true });
  const staging = mkdtempSync(resolve(cache, "download-"));
  const temporaryArchive = resolve(staging, archiveName);
  try {
    writeFileSync(temporaryArchive, contents);
    renameSync(temporaryArchive, archive);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function verifyArchive(contents: Uint8Array, source: string) {
  if(createHash("sha256").update(contents).digest("hex") !== expected) {
    throw new Error(`Dawn archive checksum mismatch for ${source}`);
  }
}

function dawnIsInstalled() {
  if(!existsSync(destination)) return false;
  const marker = resolve(destination, ".sha256");
  if(existsSync(marker) && readFileSync(marker, "utf8") === expected) return true;
  throw new Error(`Remove the stale Dawn extraction at ${destination} and rerun setup`);
}
