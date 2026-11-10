async (page) => {
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true; window.calls = []; window.historyMode = "mixed";
    const outcome = (name, success, status) => ({ name, success, status, message: "原始原因：不可根据这段文字猜测状态" });
    const record = (outcomes, extra = {}) => ({ at: 1794272400000, estimated: 1024, released: 999999999, beforeAvailable: 2048, afterAvailable: 1024, diskVerified: true, warning: null, outcomes, ...extra });
    window.records = [
      record([outcome("完成样例", true, "success"), outcome("失败样例", false, "failed"), outcome("跳过样例", false, "skipped")]),
      record([outcome("旧完成样例", true), outcome("旧未完成样例", false)], { warning: "旧记录说明", diskVerified: false }),
      record([]),
    ];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = { transformCallback() { return 1; }, async invoke(cmd, args) {
      window.calls.push({ cmd, args });
      if (cmd.startsWith("plugin:event|")) return 1;
      if (cmd === "disk_info") return { total: 4096, available: 1024, used: 3072, shared: 0 };
      if (cmd === "cleanup_history") {
        if (window.historyMode === "error") throw "合成：记录读取失败";
        if (window.historyMode === "loading") return new Promise(resolve => { window.finishHistory = () => resolve(window.records); });
        return window.historyMode === "empty" ? [] : window.records;
      }
      throw new Error(`未预期IPC：${cmd}`);
    }};
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://127.0.0.1:1420");
  await page.getByRole("button", { name: /^清理记录/ }).click();
  const browser = page.getByRole("region", { name: "清理记录浏览" });
  const list = browser.getByRole("list", { name: "选择清理记录" });
  const rows = list.getByRole("button");
  const detail = browser.getByRole("region", { name: "所选清理记录" });
  const result = detail.getByRole("region", { name: "历史清理结果" });
  if (await rows.count() !== 3) throw new Error("同时间戳记录被合并");
  if (await rows.first().getAttribute("aria-pressed") !== "true") throw new Error("未默认选择最近记录");
  const before = await page.evaluate(() => window.calls.length);
  await result.getByRole("button", { name: "失败 1", exact: true }).click();
  await result.getByText("失败 · 失败样例", { exact: true }).waitFor();
  if (await result.locator(".cleanup-outcome").count() !== 1) throw new Error("历史筛选未生效");
  await result.getByText("失败 · 失败样例", { exact: true }).click();
  await result.getByText("原始原因：不可根据这段文字猜测状态", { exact: true }).waitFor();
  await result.getByText("磁盘可用空间减少", { exact: false }).waitFor();
  if (await result.getByText("999999999", { exact: false }).count()) throw new Error("把released旧字段当成实际释放量");
  await page.getByRole("button", { name: "清理", exact: true }).click();
  await page.getByRole("button", { name: /^清理记录/ }).click();
  if (await result.getByRole("button", { name: "失败 1", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("切页丢失筛选");
  await rows.first().focus(); await page.keyboard.press("ArrowDown");
  if (!await rows.nth(1).evaluate(el => el === document.activeElement)) throw new Error("记录方向键无效");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "所选清理记录");
  await result.getByRole("button", { name: "未明确 1", exact: true }).click();
  await result.getByText("未明确 · 旧未完成样例", { exact: true }).waitFor();
  await result.getByText("磁盘变化未能核验", { exact: false }).waitFor();
  await page.keyboard.press("Escape");
  if (!await rows.nth(1).evaluate(el => el === document.activeElement)) throw new Error("Esc未返回所选记录");
  await rows.nth(2).click();
  await result.getByText("未取得逐项清理结果，请重新扫描核实", { exact: true }).waitFor();
  if (await result.getByText("命令均已完成，请查看核验结果", { exact: true }).count()) throw new Error("空记录误报成功");
  await rows.first().click();
  await result.getByRole("button", { name: "完成 1", exact: true }).click();
  await result.getByText("完成 · 完成样例", { exact: true }).waitFor();
  if (await page.evaluate(() => window.calls.length) !== before) throw new Error("历史浏览或筛选触发IPC");
  await page.screenshot({ path: "output/playwright/cleanup-history-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 960, height: 760 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("960px横向溢出");
  await page.screenshot({ path: "output/playwright/cleanup-history-narrow.png", fullPage: true });
  await result.getByRole("button", { name: "重新检查当前空间", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  if (await page.evaluate(() => window.calls.length) !== before) throw new Error("未确认范围即重新扫描");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^清理记录/ }).click();
  await page.evaluate(() => { window.historyMode = "loading"; });
  const refresh = browser.getByRole("button", { name: "重新读取记录", exact: true });
  await refresh.click();
  await browser.getByRole("status").getByText("正在读取清理记录…", { exact: true }).waitFor();
  if (await refresh.isEnabled()) throw new Error("读取中可以重复提交");
  await page.evaluate(() => window.finishHistory());
  await refresh.waitFor({ state: "visible" });
  await page.evaluate(() => { window.historyMode = "error"; });
  await refresh.click();
  await browser.getByRole("alert").getByText("清理记录读取失败", { exact: true }).waitFor();
  if (await browser.getByText("还没有清理记录", { exact: true }).count()) throw new Error("读取失败误报无历史");
  if (await rows.count() !== 3) throw new Error("重读失败丢失旧记录");
  await page.evaluate(() => { window.historyMode = "empty"; });
  await refresh.click();
  await browser.getByText("还没有清理记录", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: /^清理记录/ }).click();
  if (await rows.count() !== 3) throw new Error("重载后无法读取持久记录");
  if (await page.evaluate(() => window.calls.some(c => /scan_disk|prepare_cleanup|execute_cleanup/.test(c.cmd)))) throw new Error("查看记录触发扫描或清理");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("通过：历史选择、混合／旧／空结果、同时间戳、核验边界、切页筛选、键盘、加载与失败重读、窄窗及重新扫描确认（模拟IPC）");
}
