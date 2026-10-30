async (page) => {
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.isTauri = true;
    window.calls = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.calls.push({ cmd, args });
        if (cmd === "scan_roots") {
          if (window.catalogFail) throw new Error("合成目录列表失败");
          return [
            ["root-home", "用户主目录", "/Users/fixture"], ["root-apps", "已安装应用", "/Applications"],
            ["root-opt", "开发工具与数据库", "/opt"], ["root-library", "系统应用支持", "/Library"],
            ["root-var", "系统运行数据", "/private/var"], ["root-data-system", "数据卷系统文件", "/System/Volumes/Data/System"],
            ["root-shared", "共享用户文件", "/Users/Shared"], ["root-local", "本地安装文件", "/usr/local"],
          ].map(([id, name, path]) => ({ id, name, path }));
        }
        if (cmd === "cancel_scan") { window.wasCancelled = true; window.finishScan?.(); return; }
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "cleanup_history") return [];
        const disk = {
          total: 1000000000,
          available: 500000000,
          used: 500000000,
          shared: 0,
        };
        if (cmd === "disk_info") return disk;
        if (cmd === "open_privacy_settings") return;
        if (cmd === "reveal_current_app") {
          if (window.revealFail) throw "测试：当前为开发模式，请使用打包应用";
          return "/Users/fixture/留白.app";
        }
        if (cmd === "scan_disk") {
          if (window.holdScan) await new Promise(resolve => { window.finishScan = resolve; });
          return {
            id: Date.now(), extended: args.extended, disk, items: [], roots: (args.rootIds ?? []).map(id => ({ id, name: id === "root-apps" ? "已安装应用" : "用户主目录", path: id === "root-apps" ? "/Applications" : "/Users/fixture", bytes: 0, files: 0, issues: 0, complete: true, blocked: "仅分析", category: "主要目录", command: null, impact: "只读", details: [] })),
            durationMs: 1200, cancelled: !!window.wasCancelled,
            timings: [{ id: "discovery", name: "准备扫描目标", durationMs: 20 },
              { id: "fixed", name: "固定项目示例", durationMs: window.wasCancelled ? null : 0 }],
          };
        }
        throw new Error(cmd);
      },
    };
  });
  await page.goto("http://127.0.0.1:1420");
  const scans = () =>
    page.evaluate(() => window.calls.filter((c) => c.cmd === "scan_disk"));
  await page.getByRole("button", { name: "开始扫描", exact: true }).click();
  if ((await scans()).length) throw new Error("确认前启动了扫描");
  if (
    !(await page
      .getByRole("radio", { name: "常规扫描：uv、npm、pip 默认缓存" })
      .isChecked())
  )
    throw new Error("缺省范围错误");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  if ((await scans()).length) throw new Error("取消启动了扫描");
  await page.getByRole("button", { name: "开始扫描", exact: true }).click();
  await page
    .getByRole("radio", { name: "扩展扫描：主要目录与应用数据" })
    .check();
  const start = page.getByRole("button", {
    name: /开始(常规|扩展)扫描/,
    exact: true,
  });
  if (await start.isEnabled()) throw new Error("扩展扫描未确认范围即可开始");
  await page.getByRole("button", { name: "打开系统设置", exact: true }).click();
  if ((await scans()).length || (await start.isEnabled()))
    throw new Error("打开设置被误认为授权成功");
  const guide = page.getByRole("region", { name: "集中授权指引" });
  await guide.getByText("系统授权状态：未验证。", { exact: false }).waitFor();
  await guide
    .getByRole("button", { name: "在 Finder 中定位当前应用", exact: true })
    .click();
  await guide.getByText("/Users/fixture/留白.app", { exact: true }).waitFor();
  if ((await scans()).length || (await start.isEnabled()))
    throw new Error("定位应用被误认为授权成功");
  await page.evaluate(() => (window.revealFail = true));
  await guide
    .getByRole("button", { name: "在 Finder 中定位当前应用", exact: true })
    .click();
  await page
    .getByRole("alert")
    .getByText("测试：当前为开发模式，请使用打包应用", { exact: true })
    .waitFor();
  if ((await scans()).length) throw new Error("定位失败启动扫描");
  await page.setViewportSize({ width: 960, height: 660 });
  await start.scrollIntoViewIfNeeded();
  const box = await page.getByRole("dialog").boundingBox();
  if (
    !box ||
    box.x < 0 ||
    box.y < 0 ||
    box.x + box.width > 960 ||
    box.y + box.height > 660
  )
    throw new Error("引导超出窗口");
  await page.getByRole("checkbox", { name: "选择主要目录：用户主目录" }).waitFor();
  if (await page.getByRole("checkbox", { name: /^选择主要目录：/, checked: true }).count() !== 8) throw new Error("未保持默认全部目录");
  const ack = page.getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" });
  await ack.check();
  await page.getByRole("button", { name: "取消全部主要目录", exact: true }).click();
  if (await ack.isChecked() || await start.isEnabled()) throw new Error("变更范围后没有重新确认");
  await page.getByRole("checkbox", { name: "选择主要目录：已安装应用" }).check();
  await ack.check();
  await page.getByRole("dialog").screenshot({ path: "output/playwright/scan-scope-098.png" });
  await start.click();
  await page.waitForFunction(() =>
    window.calls.some((c) => c.cmd === "scan_disk"),
  );
  if (JSON.stringify((await scans())[0].args.rootIds) !== JSON.stringify(["root-apps"])) throw new Error("主要目录子集没有传递");
  await page.getByText("查看扫描阶段耗时", { exact: true }).click();
  await page.getByRole("list", { name: "扫描阶段耗时列表" }).getByRole("listitem").filter({ hasText: "固定项目示例" }).getByText("0.0 秒", { exact: true }).waitFor();
  if ((await scans())[0].args.extended !== true)
    throw new Error("扩展范围未传递");
  await page
    .getByRole("button", { name: "重新扫描", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /开始(常规|扩展)扫描/, exact: true })
    .click();
  const calls = await scans();
  if (calls.length !== 2 || calls[1].args.extended !== false)
    throw new Error("后续扫描未恢复默认范围");
  await page.getByRole("button", { name: "重新扫描", exact: true }).click();
  await page.evaluate(() => { window.catalogFail = true; });
  await page.getByRole("radio", { name: "扩展扫描：主要目录与应用数据" }).check();
  await page.getByRole("alert").getByText(/目录选项加载失败/).waitFor();
  await page.getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" }).check();
  if (await start.isEnabled() || (await scans()).length !== 2) throw new Error("加载失败回退全量扫描");
  await page.evaluate(() => { window.catalogFail = false; });
  await page.getByRole("button", { name: "重新加载目录", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择主要目录：用户主目录" }).waitFor();
  await page.getByRole("button", { name: "取消全部主要目录", exact: true }).click();
  await page.getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" }).check();
  await start.click();
  await page.waitForFunction(() => window.calls.filter(c => c.cmd === "scan_disk").length === 3);
  if (JSON.stringify((await scans())[2].args.rootIds) !== "[]") throw new Error("空集合回退全量");
  await page.locator('.scan-root-summary').getByText(/未选择；仅分析扩展固定/).waitFor();
  await page.evaluate(() => { window.holdScan = true; });
  await page.getByRole("button", { name: "重新扫描", exact: true }).click();
  await start.click();
  await page.getByRole("timer").getByText(/本次等待/).waitFor();
  await page.waitForFunction(() => /本次等待 [1-9]/.test(document.querySelector('[role="timer"]')?.textContent ?? ""));
  await page.getByRole("button", { name: "停止扫描", exact: true }).click();
  await page.getByRole("region", { name: "本次统计不完整" }).waitFor();
  await page.getByText("查看扫描阶段耗时", { exact: true }).click();
  await page.getByRole("list", { name: "扫描阶段耗时列表" }).getByText("尚未访问", { exact: true }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("960px计时布局溢出");
  if (await page.evaluate(() => window.calls.some(c => /prepare_cleanup|execute_cleanup/.test(c.cmd)))) throw new Error("只读范围触发清理");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("扫描范围／子集／空集／加载失败／重试／阅读确认重置、阶段计时／停止、960px和零清理验证通过（模拟IPC）");
};
