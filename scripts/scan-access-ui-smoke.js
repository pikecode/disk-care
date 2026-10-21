async (page) => {
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
        if (cmd === "scan_disk")
          return {
            id: Date.now(),
            disk,
            items: [],
            roots: [],
            durationMs: 1,
            cancelled: false,
          };
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
  await page.getByRole("checkbox").check();
  await start.click();
  await page.waitForFunction(() =>
    window.calls.some((c) => c.cmd === "scan_disk"),
  );
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
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("扫描前确认、取消、设置不自动授权、默认范围和扩展范围验证通过");
};
