import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CargoPackage = {
  id: string,
  name: string,
  version: string,
  license: string | null,
  license_file: string | null,
  manifest_path: string,
  repository: string | null
};

type CargoMetadata = {
  packages: CargoPackage[],
  resolve: {
    root: string,
    nodes: CargoNode[]
  }
};

type CargoNode = {
  id: string,
  deps: Array<{ pkg: string, dep_kinds: Array<{ kind: string | null }> }>
};

const destination = fileURLToPath(new URL("../../core/build/licenses/rust", import.meta.url));
const metadata = JSON.parse(execFileSync("cargo", [
  "metadata",
  "--locked",
  "--offline",
  "--format-version",
  "1",
  "--filter-platform",
  "x86_64-unknown-linux-gnu"
], { encoding: "utf8" })) as CargoMetadata;
const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
const dependencies = new Set([metadata.resolve.root]);

for(const id of dependencies) {
  const node = nodes.get(id);

  if(!node) {
    throw new Error(`Missing Cargo dependency node for ${id}`);
  }

  for(const dependency of node.deps) {
    if(dependency.dep_kinds.some(kind => kind.kind === null)) {
      dependencies.add(dependency.pkg);
    }
  }
}

rmSync(destination, { recursive: true, force: true });
for(const crate of metadata.packages) {
  if(crate.id !== metadata.resolve.root && dependencies.has(crate.id)) {
    copyCrateNotices(crate);
  }
}

copyStandardLibraryNotices();

function copyCrateNotices(crate: CargoPackage) {
  const source = dirname(crate.manifest_path);
  const notices = new Set(readdirSync(source, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^(license|notice|copying|copyright|unlicense)([-_.]|$)/i.test(entry.name))
    .map(entry => join(source, entry.name)));

  if(crate.license_file) {
    notices.add(resolve(source, crate.license_file));
  }

  if(notices.size === 0 && crate.repository === "https://github.com/napi-rs/napi-rs" && crate.license === "MIT") {
    // The published crates omit the repository-level license.
    notices.add(fileURLToPath(new URL("../licenses/napi-rs.txt", import.meta.url)));
  }

  if(notices.size === 0) {
    throw new Error(`Missing license notices for ${crate.name} ${crate.version}`);
  }

  const target = join(destination, `${crate.name}-${crate.version}`);

  mkdirSync(target, { recursive: true });
  for(const notice of notices) {
    cpSync(notice, join(target, basename(notice)));
  }

  if(crate.name === "glfw-sys") {
    cpSync(join(source, "glfw/LICENSE.md"), join(target, "upstream-glfw-LICENSE.md"));
  }
}

function copyStandardLibraryNotices() {
  const sysroot = execFileSync("rustc", ["--print", "sysroot"], { encoding: "utf8" }).trim();
  const docs = [
    join(sysroot, "share/doc/rust/html"),
    join(sysroot, "share/doc/rust")
  ].find(directory => existsSync(join(directory, "COPYRIGHT-library.html")) && existsSync(join(directory, "licenses")));

  if(!docs) {
    return;
  }

  const target = join(destination, "rust-standard-library");

  cpSync(join(docs, "COPYRIGHT-library.html"), join(target, "COPYRIGHT-library.html"));
  cpSync(join(docs, "licenses"), join(target, "licenses"), { recursive: true });
}
