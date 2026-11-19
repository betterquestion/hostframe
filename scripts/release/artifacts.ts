import { join } from "node:path";

export const artifactDirectory = "build/npm-release";
export const planFile = join(artifactDirectory, "plan.json");
export const registry = "https://registry.npmjs.org";

export type ReleasePlan = {
  ref: string,
  commit: string,
  packages: Array<{ name: string, version: string, channel: "latest" | "next", integrity?: string }>
};

export function archivePath(name: string) {
  return join(artifactDirectory, `${encodeURIComponent(name)}.tgz`);
}

export async function archiveIntegrity(path: string) {
  const contents = await Bun.file(path).bytes();
  return `sha512-${Bun.CryptoHasher.hash("sha512", contents, "base64")}`;
}
