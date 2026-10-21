async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.analysisCalls = [];
    window.analysisMode = "normal";
    const npm = {
      id: "npm",
      name: "npm 下载缓存",
      category: "开发缓存",
      path: "/fixture/.npm/_cacache",
      bytes: 2 * 1024 ** 3,
      files: 3,
      issues: 0,
      complete: true,
      blocked: null,
      command: "npm cache clean --force --cache …",
      impact: "下次安装需要重新下载。",
      details: [],
    };
    const disk = {
      total: 100 * 1024 ** 3,
      available: 20 * 1024 ** 3,
      used: 70 * 1024 ** 3,
      shared: 10 * 1024 ** 3,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.analysisCalls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info") return disk;
        if (cmd === "cleanup_history") return [];
        if (cmd === "scan_disk")
          return {
            id:
              Date.now() -
              (window.analysisMode === "stale" ? 31 * 60 * 1000 : 0),
            disk,
            roots: [],
            durationMs: 300,
            cancelled: false,
            items: [
              {
                ...npm,
                bytes: window.analysisMode === "empty" ? 0 : npm.bytes,
              },
              {
                ...npm,
                id: "uv",
                name: "uv 缓存",
                bytes: 10 * 1024 ** 3,
                blocked: "PID 77 正在使用缓存，请先处理运行依赖。",
              },
              {
                ...npm,
                id: "pip",
                name: "pip 缓存",
                bytes: 3 * 1024 ** 3,
                complete: false,
                issues: 1,
              },
              {
                ...npm,
                id: "docker",
                name: "Docker 数据",
                bytes: 30 * 1024 ** 3,
                command: null,
                blocked: "此项仅分析",
              },
            ],
          };
        if (cmd === "prepare_cleanup") {
          if (args.ids.join(",") !== "npm") throw "不应预览受阻或只读数据";
          return {
            token: 900,
            createdAt: Date.now(),
            items: [npm],
            estimated: npm.bytes,
          };
        }
        if (cmd === "execute_cleanup")
          return {
            at: Date.now(),
            estimated: npm.bytes,
            released: 512 * 1024 ** 2,
            beforeAvailable: disk.available,
            afterAvailable: disk.available + 512 * 1024 ** 2,
            outcomes: [
              {
                name: npm.name,
                success: true,
                message: "模拟执行，没有删除真实数据",
              },
            ],
            warning: null,
          };
        throw new Error(`未定义调用 ${cmd}`);
      },
    };
  });
  await page.goto("http://127.0.0.1:1420");
  await page.getByRole("button", { name: "开始扫描", exact: true }).click();
  await page
    .getByRole("radio", { name: "扩展扫描：主要目录与应用数据" })
    .check();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page
    .getByRole("button", { name: /开始(常规|扩展)扫描/, exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "可清理空间分析",
    exact: true,
  });
  await panel.waitFor();
  if (
    await page
      .getByRole("textbox", { name: "希望额外释放（GiB）", exact: true })
      .count()
  )
    throw new Error("目标输入必须移除");
  if ((await panel.locator(".analysis-candidates article").count()) !== 1)
    throw new Error("只能开放 npm，不能凑目标扩大范围");
  await page
    .locator(".metric-card")
    .getByText("2.0 GiB", { exact: true })
    .waitFor();
  if (
    !(
      await panel
        .getByRole("button", { name: "查看可预览缓存", exact: true })
        .locator("strong")
        .innerText()
    ).startsWith("1")
  )
    throw new Error("分类应显示数量而不重复占用");
  if (await page.getByRole("checkbox", { checked: true }).count())
    throw new Error("默认不勾选");
  if (
    await page
      .getByRole("checkbox", { name: "选择uv 缓存", exact: true })
      .isEnabled()
  )
    throw new Error("原清单必须同步禁止受阻项");
  await panel.locator("summary").filter({ hasText: "处理阻碍" }).click();
  await panel.getByText("PID 77 正在使用缓存", { exact: false }).waitFor();
  await page.setViewportSize({ width: 960, height: 820 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("最小窗口出现横向溢出");
  await panel.screenshot({
    path: "output/playwright/cleanup-analysis-060.png",
  });
  const preview = panel.getByRole("button", {
    name: "预览npm 下载缓存清理",
    exact: true,
  });
  await preview.click();
  if (
    await page
      .getByRole("button", { name: "确认清理", exact: true })
      .isEnabled()
  )
    throw new Error("未确认影响时不得执行");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  if (
    await page.evaluate(() =>
      window.analysisCalls.some((c) => c.cmd === "execute_cleanup"),
    )
  )
    throw new Error("取消不得执行");
  await preview.click();
  await page
    .getByRole("checkbox", {
      name: "我已了解影响，确认清理以上缓存",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "确认清理", exact: true }).click();
  await page
    .getByText("命令均已完成，请查看核验结果", { exact: true })
    .waitFor();
  await page.getByText("512.0 MiB", { exact: true }).first().waitFor();
  if (await panel.count()) throw new Error("清理后扫描必须失效");
  for (const mode of ["empty", "stale"]) {
    await page.evaluate((value) => {
      window.analysisMode = value;
    }, mode);
    await page
      .locator(".page-heading")
      .getByRole("button", { name: /扫描/ })
      .click();
    await page
      .getByRole("button", { name: /开始(常规|扩展)扫描/, exact: true })
      .click();
    if (mode === "empty")
      await panel
        .getByText("本次未发现可直接预览的缓存", { exact: false })
        .waitFor();
    else {
      await panel.getByText("扫描已超过 30 分钟", { exact: false }).waitFor();
      if (
        await panel
          .getByRole("button", { name: "预览npm 下载缓存清理", exact: true })
          .isEnabled()
      )
        throw new Error("过期扫描不能预览");
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "清理分析界面通过：实际分类合计、无目标输入、默认无选择、阻碍依据、统一资格、预览取消确认、磁盘变化、失效、空候选和过期。全部模拟 IPC。",
  );
};
