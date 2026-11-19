import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type ReleasePackage = {
  directory: string,
  name: string,
  version: string,
  manifest: Record<string, unknown>
};

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

export function stableReleaseTag(name: string, version: string) {
  return `npm/${name}@${version}`;
}

export async function publicPackages() {
  const packages: ReleasePackage[] = [];

  for(const name of (await readdir("packages")).sort()) {
    const directory = `packages/${name}`;
    const file = Bun.file(join(directory, "package.json"));

    if(!await file.exists()) {
      continue;
    }

    const manifest = await file.json();

    if(manifest.private) {
      continue;
    }

    if(typeof manifest.name !== "string" || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(manifest.name)
      || typeof manifest.version !== "string" || !versionPattern.test(manifest.version)) {
      throw new Error(`Invalid release package name or version in ${file.name}`);
    }

    packages.push({
      directory,
      name: manifest.name,
      version: manifest.version,
      manifest
    });
  }

  return packages;
}

export function getPackage(packages: ReleasePackage[], name: string) {
  const pkg = packages.find(pkg => pkg.name === name);

  if(!pkg) {
    throw new Error(`Unknown public package ${name}. Available packages: ${packages.map(pkg => pkg.name).join(", ")}`);
  }

  return pkg;
}

export function nextVersion(version: string, bump: string) {
  const match = versionPattern.exec(version);

  if(!match) {
    throw new Error(`Invalid release version: ${version}`);
  }

  const [, major, minor, patch] = match;

  switch(bump) {
    case "major": return `${Number(major) + 1}.0.0`;
    case "minor": return `${major}.${Number(minor) + 1}.0`;
    case "patch": return `${major}.${minor}.${Number(patch) + 1}`;
    case "stable": return `${major}.${minor}.${patch}`;
    default: throw new Error(`Unknown version bump: ${bump}`);
  }
}

export async function writeVersion(pkg: ReleasePackage, version: string) {
  if(pkg.version === version) {
    return;
  }

  const file = Bun.file("bun.lock");
  const lock = await file.text();
  const header = `    ${JSON.stringify(pkg.directory)}: {\n`;
  const start = lock.indexOf(header, lock.indexOf("\"workspaces\": {"));
  const end = lock.indexOf("\n    },", start);
  const previous = `      "version": ${JSON.stringify(pkg.version)},`;
  const updated = `      "version": ${JSON.stringify(version)},`;
  const workspace = lock.slice(start, end);

  if(start < 0 || end < 0 || !workspace.includes(previous)) {
    throw new Error(`bun.lock has no matching workspace version for ${pkg.name}@${pkg.version}`);
  }

  const manifest = Bun.file(join(pkg.directory, "package.json"));
  const original = await manifest.text();
  const candidate = original.replace(/^([ \t]*"version"\s*:\s*)"[^"]+"/m, (_, key: string) => key + JSON.stringify(version));
  const contents = JSON.parse(candidate).version === version ? candidate : `${JSON.stringify({ ...pkg.manifest, version }, null, 2)}\n`;

  await Bun.write(file, lock.slice(0, start) + workspace.replace(previous, updated) + lock.slice(end));
  await Bun.write(manifest, contents);
}
