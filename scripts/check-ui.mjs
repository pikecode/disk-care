import { spawn, spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { chromium } from "playwright";

// 固定清单只执行仓库内受信的模拟脚本，不接受任意脚本路径。
const cases = ["product-navigation", "scan-access", "cleanup-results", "cleanup-history", "scan-activity", "app-residue", "app-uninstall", "project", "space-map", "ai-data", "developer-tools"];
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output/ui-check");
mkdirSync(output, { recursive: true });
mkdirSync(resolve(root, "output/playwright"), { recursive: true });
process.chdir(root);
const results = [];
const startedAt = new Date().toISOString();
const saveReport = status => writeFileSync(resolve(output, "results.json"), JSON.stringify({ status, startedAt, expected: cases.length, results }, null, 2) + "\n");
saveReport("running");
const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (build.error || build.status !== 0) {
  saveReport("failed");
  throw build.error ?? new Error("交互检查前构建失败");
}
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "1420", "--strictPort"], {
  detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" },
});
let serverOutput = "";
let serverError;
let ready = false;
server.on("error", error => { serverError = error; });
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => {
  serverOutput = (serverOutput + data).slice(-16384);
  if (serverOutput.includes("http://127.0.0.1:1420/")) ready = true;
});
let browser;
const stopServer = () => {
  if (!server.pid) return;
  try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
};
process.once("SIGINT", () => { saveReport("interrupted"); stopServer(); process.exit(130); });
process.once("SIGTERM", () => { saveReport("interrupted"); stopServer(); process.exit(143); });
try {
  const started = Date.now();
  while (!ready) {
    if (serverError || server.exitCode !== null || Date.now() - started > 15000) {
      throw serverError ?? new Error(`预览服务未启动；1420端口须空闲。\n${serverOutput}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  for (const name of cases) {
    const context = await browser.newContext();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const started = Date.now();
    let failure;
    try {
      const filename = resolve(root, `scripts/${name}-ui-smoke.js`);
      const source = readFileSync(filename, "utf8").trim().replace(/;\s*$/, "");
      const scenario = new vm.Script(`(${source})`, { filename }).runInThisContext();
      if (typeof scenario !== "function") throw new Error("模拟脚本必须为页面函数");
      await scenario(page);
      results.push({ name, status: "passed", durationMs: Date.now() - started });
      console.log(`通过：${name}`);
    } catch (error) {
      failure = error;
      results.push({ name, status: "failed", durationMs: Date.now() - started, error: String(error) });
      await page.screenshot({ path: resolve(output, `${name}-failed.png`), fullPage: true }).catch(() => {});
      console.error(`失败：${name}\n${error}`);
    } finally {
      await context.tracing.stop(failure ? { path: resolve(output, `${name}-trace.zip`) } : {});
      await context.close();
    }
  }
  if (results.some(result => result.status === "failed")) throw new Error("部分交互模拟未通过，详见output/ui-check");
  console.log(`通过：${results.length}组生产构建交互模拟；不代表原生权限验收。`);
} finally {
  const passed = results.length === cases.length && results.every(result => result.status === "passed");
  saveReport(passed ? "passed" : "failed");
  if (browser) await browser.close();
  stopServer();
}
