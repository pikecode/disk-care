async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() => {
    window.isTauri = true;
    window.clarityCalls = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.clarityCalls.push(cmd);
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "cleanup_history") return [];
        const disk = {
          total: 100000000000,
          available: 30000000000,
          used: 70000000000,
          shared: 0,
        };
        if (cmd === "disk_info") return disk;
        if (cmd === "scan_disk")
          return {
            id: Date.now(),
            disk,
            extended: args.extended,
            durationMs: 100,
            cancelled: false,
            items: [
              {
                id: "npm",
                name: "npm 下载缓存",
                path: "/Users/fixture/.npm/_cacache",
                category: "开发缓存",
                bytes: 1000000000,
                files: 10,
                issues: 0,
                complete: true,
                blocked: null,
                command: "npm cache clean",
                details: [],
                impact: "下次安装时重新下载。",
              },
            ],
            roots: [],
          };
        throw new Error(cmd);
      },
    };
  });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("http://127.0.0.1:1420");
  await page.getByRole("heading", { name: "磁盘空间", exact: true }).waitFor();
  await page.getByRole("button", { name: "开始扫描", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.screenshot({
    path: "output/playwright/scan-settings-basic-085.png",
  });
  await page
    .getByRole("radio", { name: "扩展扫描：主要目录与应用数据" })
    .check();
  if (
    (await dialog.locator(".settings-details").first().getAttribute("open")) !==
    null
  )
    throw new Error("路径说明未默认折叠");
  await dialog.screenshot({
    path: "output/playwright/scan-settings-extended-085.png",
  });
  await page.setViewportSize({ width: 960, height: 660 });
  const start = dialog.getByRole("button", {
    name: "开始扩展扫描",
    exact: true,
  });
  const inside = async (locator) => {
    const b = await locator.boundingBox();
    if (!b || b.x < 0 || b.y < 0 || b.x + b.width > 960 || b.y + b.height > 660)
      throw new Error("主要操作超出窗口");
  };
  await inside(start);
  if (await start.isEnabled()) throw new Error("跳过范围确认");
  await dialog.getByText("如何授权？", { exact: true }).click();
  await inside(start);
  await dialog.getByRole("button", { name: "关闭扫描设置" }).click();
  if (await page.evaluate(() => window.clarityCalls.includes("scan_disk")))
    throw new Error("取消触发扫描");
  await page.getByRole("button", { name: "开始扫描", exact: true }).click();
  const basic = dialog.getByRole("button", {
    name: "开始常规扫描",
    exact: true,
  });
  await inside(basic);
  if (!(await basic.isEnabled())) throw new Error("常规扫描被不必要的确认阻止");
  const scrolling = await dialog
    .locator(".scan-settings-content")
    .evaluate((e) => e.scrollHeight > e.clientHeight);
  if (scrolling) throw new Error("常规扫描首屏需要滚动");
  await basic.click();
  await page.getByRole("region", { name: "可清理空间分析" }).waitFor();
  const current = page
    .getByRole("list", { name: "操作步骤" })
    .locator('[aria-current="step"]');
  if (!(await current.innerText()).includes("查看结果"))
    throw new Error("操作阶段未更新");
  if (
    await page
      .getByRole("checkbox", { name: "选择npm 下载缓存", exact: true })
      .isChecked()
  )
    throw new Error("清理项目被自动选择");
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("页面横向溢出");
  if (await page.locator(".actionbar").count())
    throw new Error("未选择时不应显示清理操作栏");
  const item = page.getByRole("checkbox", {
    name: "选择npm 下载缓存",
    exact: true,
  });
  await item.check();
  const bar = page.locator(".actionbar");
  await bar.waitFor();
  await inside(bar.getByRole("button", { name: "取消选择", exact: true }));
  await inside(bar.getByRole("button", { name: "预览清理计划", exact: true }));
  await page
    .getByRole("group", { name: "按处理状态筛选", exact: true })
    .getByRole("button", { name: /^仅供分析/ })
    .click();
  await page
    .getByText("其中 1 项不在当前筛选中，预览将完整列出", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  if (!(await item.isChecked())) throw new Error("清除筛选不应丢失选择");
  await page
    .getByRole("button", { name: "查看可预览项目", exact: true })
    .click();
  const filter = page
    .getByRole("group", { name: "按处理状态筛选", exact: true })
    .getByRole("button", { name: /^可预览/ });
  if ((await filter.getAttribute("aria-pressed")) !== "true")
    throw new Error("候选入口未联动筛选");
  await bar.getByRole("button", { name: "取消选择", exact: true }).click();
  await bar.waitFor({ state: "detached" });
  if (await item.isChecked()) throw new Error("取消选择未生效");
  if ((await filter.getAttribute("aria-pressed")) !== "true")
    throw new Error("取消选择不应修改筛选");
  if (
    await page.evaluate(() =>
      window.clarityCalls.some((c) =>
        ["execute_cleanup", "prepare_cleanup"].includes(c),
      ),
    )
  )
    throw new Error("浏览与取消操作不应进入清理");
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const firstPreview = await page
    .getByRole("button", { name: "预览npm 下载缓存清理", exact: true })
    .boundingBox();
  if (!firstPreview || firstPreview.y + firstPreview.height > 820)
    throw new Error("桌面首屏无法看到第一项预览操作");
  await page.screenshot({ path: "output/playwright/overview-085.png" });
  await page
    .getByRole("region", { name: "可清理空间分析", exact: true })
    .screenshot({ path: "output/playwright/results-detail-085.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "两种窗口、候选入口、清除筛选保留选择、取消选择保留筛选、无自动预览清理检查通过",
  );
};
