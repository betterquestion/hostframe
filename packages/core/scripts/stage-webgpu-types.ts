import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const upstream = new URL(".", import.meta.resolve("@webgpu/types/package.json"));
const declarations = readFileSync(new URL("dist/index.d.ts", upstream), "utf8");
const source = ts.createSourceFile("webgpu.d.ts", declarations, ts.ScriptTarget.Latest);
const browserInterfaces = new Set(["HTMLCanvasElement", "HTMLVideoElement", "OffscreenCanvas", "Navigator", "WorkerNavigator"]);

const scoped = source.statements.flatMap(statement => {
  if(ts.isInterfaceDeclaration(statement) && browserInterfaces.has(statement.name.text)) {
    return [];
  }

  if(!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement) && !ts.isVariableStatement(statement)) {
    throw new Error(`Unexpected declaration in @webgpu/types: ${statement.getText(source)}`);
  }

  const start = statement.getStart(source);

  return [declarations.slice(statement.getFullStart(), start) + "export " + statement.getText(source)];
}).join("");

const destination = new URL("../build/types/", import.meta.url);

mkdirSync(destination, { recursive: true });

const platform = readFileSync(new URL("./webgpu-platform.d.ts", import.meta.url), "utf8");

writeFileSync(new URL("webgpu.d.ts", destination), `// Generated from @webgpu/types. See LICENSE.webgpu.\n${platform}\n${scoped}\n`);
cpSync(fileURLToPath(new URL("LICENSE", upstream)), fileURLToPath(new URL("LICENSE.webgpu", destination)));
