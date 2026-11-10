async (page) => {
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.calls = [];
    window.resultMode = "mixed";
    const disk = { total: 100000000, available: 50000000, used: 50000000, shared: 0 };
    const item = { id: "uv", name: "uv 缓存", category: "开发缓存", path: "/Users/fixture/.cache/uv", bytes: 1048576, files: 3, issues: 0, complete: true, command: "uv cache clean", impact: "需要重建缓存", blocked: null, details: [] };
    const entry = (name, success, status) => ({ name, success, status, message: "测试：跳过文字不能作为分类依据" });
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      async invoke(cmd, args) {
        window.calls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info") return disk;
        if (cmd === "cleanup_history") return [];
        if (cmd === "scan_disk") return { id: Date.now(), disk, durationMs: 1, cancelled: false, extended: false, roots: [], items: [item] };
        if (cmd === "prepare_cleanup") return { token: 1, createdAt: Date.now(), estimated: item.bytes, items: [item] };
        if (cmd === "execute_cleanup") {
          const modes = {
            mixed: [entry("完成项", true, "success"), entry("失败项", false, "failed"), entry("跳过项", false, "skipped")],
            success: [entry("完成项", true, "success")],
            failed: [entry("失败项", false, "failed")],
            legacy: [entry("旧完成项", true), entry("旧未完成项", false)],
            empty: [],
          };
          return { at: Date.now(), estimated: 1, released: 0, beforeAvailable: disk.available, afterAvailable: disk.available, diskVerified: true, warning: null, outcomes: modes[window.resultMode] };
        }
        throw new Error(`未预期 IPC: ${cmd}`);
      },
    };
  });
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto("http://127.0.0.1:1420");
  async function scan() {
    await page.getByRole("button", { name: /^(开始检查|重新检查)$/ }).first().click();
    const dialog = page.getByRole("dialog");
    const ack = dialog.getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" });
    if (await ack.count()) await ack.check();
    await dialog.getByRole("button", { name: "开始常规扫描", exact: true }).click();
    await page.getByRole("checkbox", { name: "选择uv 缓存", exact: true }).waitFor();
  }
  async function clean(mode) {
    await page.evaluate((value) => { window.resultMode = value; }, mode);
    await scan();
    await page.getByRole("checkbox", { name: "选择uv 缓存", exact: true }).check();
    await page.getByRole("button", { name: /预览清理计划/ }).click();
    const dialog = page.getByRole("dialog", { name: "确认这次清理" });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "确认清理", exact: true }).click();
    await page.getByRole("region", { name: "本次清理结果", exact: true }).waitFor();
  }
  const card = page.getByRole("region", { name: "本次清理结果", exact: true });
  const count = async (n) => {
    if (await card.locator(".cleanup-outcome").count() !== n) throw new Error(`结果项数量应为 ${n}`);
  };
  await clean("mixed");
  const before = await page.evaluate(() => window.calls.length);
  await card.getByRole("button", { name: "失败 1", exact: true }).click();
  await count(1);
  await card.getByText("失败 · 失败项", { exact: true }).waitFor();
  const skipped = card.getByRole("button", { name: "跳过 1", exact: true });
  await skipped.focus();
  await page.keyboard.press("Enter");
  await count(1);
  if (await skipped.getAttribute("aria-pressed") !== "true") throw new Error("筛选状态不可访问");
  await card.getByText("跳过 · 跳过项", { exact: true }).waitFor();
  await card.getByRole("button", { name: "全部 3", exact: true }).click();
  await count(3);
  await card.getByRole("button", { name: "查看剩余项目", exact: true }).click();
  await card.getByRole("button", { name: "查看剩余项目", exact: true }).click();
  await page.getByText("扫描结果已失效。请重新扫描确认剩余项目，再预览和确认清理。", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".inventory") === document.activeElement);
  if (await page.getByRole("checkbox", { name: "选择uv 缓存", exact: true }).count()) throw new Error("清理后仍可选择旧项目");
  if (await page.evaluate(() => window.calls.length) !== before) throw new Error("筛选或导航触发了 IPC");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("960px 页面横向溢出");
  await page.screenshot({ path: "output/playwright/cleanup-results-m1.png", fullPage: true });
  await card.getByRole("button", { name: "重新检查", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  if (await page.evaluate(() => window.calls.length) !== before) throw new Error("扫描范围尚未确认就执行了扫描");
  await page.keyboard.press("Escape");
  await clean("success");
  await card.getByText("命令均已完成，请查看核验结果", { exact: true }).waitFor();
  await card.getByRole("button", { name: "失败 0", exact: true }).click();
  await card.getByText("没有失败项目", { exact: true }).waitFor();
  await clean("failed");
  await card.getByRole("button", { name: "全部 1", exact: true }).waitFor();
  await count(1);
  await clean("legacy");
  await card.getByRole("button", { name: "未明确 1", exact: true }).click();
  await card.getByText("未明确 · 旧未完成项", { exact: true }).waitFor();
  await card.getByRole("button", { name: "跳过 0", exact: true }).click();
  await count(0);
  await clean("empty");
  await card.getByText("未取得逐项清理结果，请重新扫描核实", { exact: true }).waitFor();
  if (await card.getByText("命令均已完成，请查看核验结果", { exact: true }).count()) throw new Error("空结果误报成功");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("通过：五种结果、筛选计数、旧记录未知状态、空结果、无额外 IPC、重复导航、键盘焦点、960px 布局、重新扫描确认。全部模拟 IPC。");
}
