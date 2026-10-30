import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 检查失败：${result.status ?? result.signal}`);
}

const output = mkdtempSync(join(tmpdir(), "disk-care-check-"));
try {
  run("npm", ["run", "build"]);
  const checks = ["cleanup-analysis", "relationships", "space-map", "directory-data", "ai-baseline"];
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--target", "ES2022",
    "--module", "commonjs", "--moduleResolution", "node", "--strict", "--skipLibCheck",
    "--outDir", output, ...checks.map(name => `scripts/${name}-check.ts`)]);
  writeFileSync(join(output, "package.json"), '{"type":"commonjs"}\n');
  for (const name of checks) run(process.execPath, [join(output, "scripts", `${name}-check.js`)]);
  run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
  run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
  run("cargo", ["clippy", "--manifest-path", "src-tauri/Cargo.toml", "--all-targets", "--", "-D", "warnings"]);
  console.log("通过：构建、五组前端断言、Rust 测试、格式及 Clippy。浏览器、真实目录和应用包需单独验收。");
} finally {
  rmSync(output, { recursive: true, force: true });
}
