async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.calls = [];
    window.protectedCache = false;
    window.rejectProtection = false;
    window.coverageMode = "complete";
    const disk = {
      total: 100000000,
      available: 50000000,
      used: 50000000,
      shared: 0,
    };
    const item = () => ({
      id: "uv",
      name: "uv 缓存",
      category: "开发缓存",
      path: "/Users/fixture/.cache/uv",
      bytes: 1048576,
      files: 10,
      issues: 0,
      complete: true,
      command: "uv cache clean --cache-dir /Users/fixture/.cache/uv",
      impact: "需要重建缓存中的临时工具环境。",
      blocked: window.protectedCache ? "用户已保护此缓存目录；仅供分析" : null,
      details: [],
      coverage: {
        status: "complete",
        permissionDenied: 0,
        excluded: 0,
        limited: false,
        cancelled: false,
      },
      evidence: {
        ruleId: "dev.uv-cache",
        version: 1,
        source: "固定默认路径；预览时重新查询工具配置",
        scope: "整个 uv 默认缓存根目录",
        recovery: "可能需要网络、私有源凭据和本地构建",
        protected: window.protectedCache,
      },
    });
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.calls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info") return disk;
        if (cmd === "cleanup_history")
          return [
            {
              at: 1,
              estimated: 1000,
              released: 0,
              beforeAvailable: 2000,
              afterAvailable: 1000,
              warning: null,
              outcomes: [{ name: "旧缓存", success: true, message: "旧记录" }],
            },
          ];
        if (cmd === "scan_disk")
          return {
            id: Date.now(),
            extended: args.extended,
            disk,
            durationMs: 1,
            cancelled: false,
            roots:
              window.coverageMode === "mixed"
                ? [
                    {
                      ...item(),
                      id: "root-missing",
                      name: "缺失目录",
                      path: "/missing",
                      bytes: 0,
                      coverage: {
                        status: "absent",
                        permissionDenied: 0,
                        excluded: 0,
                      },
                    },
                    {
                      ...item(),
                      id: "root-pending",
                      name: "未访问目录",
                      path: "/pending",
                      complete: false,
                      coverage: {
                        status: "pending",
                        permissionDenied: 0,
                        excluded: 0,
                      },
                      blocked: "此位置未访问",
                    },
                  ]
                : [],
            items: [item()],
          };
        if (cmd === "protect_uv_cache") {
          if (window.rejectProtection) throw "测试：保护设置保存失败";
          window.protectedCache = args.protected;
          return;
        }
        if (cmd === "prepare_cleanup")
          return {
            token: 200,
            createdAt: Date.now(),
            estimated: 1048576,
            items: [
              {
                ...item(),
                evidence: {
                  ...item().evidence,
                  source: "预览已重新查询 uv 配置并复核元数据",
                },
              },
            ],
          };
        if (cmd === "execute_cleanup")
          return {
            at: Date.now(),
            estimated: 1048576,
            released: 0,
            beforeAvailable: disk.available,
            afterAvailable: disk.available - 4096,
            diskVerified: true,
            warning: null,
            outcomes: [
              {
                name: "uv 缓存",
                success: true,
                status: "success",
                message: "官方命令完成",
                beforeBytes: 1048576,
                afterBytes: 4096,
                verification: "已重新测量，仍有剩余数据",
              },
              {
                name: "其他缓存",
                success: false,
                status: "skipped",
                message: "执行前检查未通过，本项未执行",
              },
            ],
          };
        throw new Error(cmd);
      },
    };
  });
  await page.goto("http://127.0.0.1:1420");
  async function scan(first = false) {
    await page
      .getByRole("button", {
        name: first ? "开始扫描" : "重新扫描",
        exact: true,
      })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    if (await page.evaluate(() => window.coverageMode === "mixed")) {
      await dialog
        .getByRole("radio", { name: "扩展扫描：主要目录与应用数据" })
        .check();
    }
    const ack = dialog.getByRole("checkbox");
    if (await ack.count()) {
      if (!(await ack.isChecked())) await ack.check();
    }
    await dialog
      .getByRole("button", { name: /开始(常规|扩展)扫描/, exact: true })
      .click();
    await page
      .getByRole("heading", { name: /本次扫描覆盖|本次统计不完整/ })
      .waitFor();
  }
  await scan(true);
  const expand = () =>
    page.getByRole("button", { name: "查看uv 缓存详情", exact: true });
  await expand().click();
  await page
    .getByText("独立规则 dev.uv-cache · 第 1 版", { exact: true })
    .waitFor();
  await page
    .getByText("可能需要网络、私有源凭据和本地构建", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 960, height: 820 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("规则详情在最小窗口横向溢出");
  await page.screenshot({
    path: "output/playwright/cleanup-trust-092-evidence.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    window.rejectProtection = true;
  });
  await page
    .getByRole("button", { name: "保护默认缓存目录", exact: true })
    .click();
  await page
    .getByRole("alert")
    .getByText("测试：保护设置保存失败", { exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.rejectProtection = false;
  });
  await page
    .getByRole("button", { name: "保护默认缓存目录", exact: true })
    .click();
  await page
    .getByRole("status")
    .getByText(/已保护 uv 默认缓存目录/)
    .waitFor();
  if (
    (await page.evaluate(
      () => window.calls.filter((c) => c.cmd === "scan_disk").length,
    )) !== 1
  )
    throw new Error("保护操作自动触发扫描");
  await scan(true);
  const select = page.getByRole("checkbox", {
    name: "选择uv 缓存",
    exact: true,
  });
  if (!(await select.isDisabled())) throw new Error("保护目录仍可选择");
  if ((await expand().getAttribute("aria-expanded")) !== "true")
    await expand().click();
  await page
    .getByRole("button", { name: "解除默认目录保护", exact: true })
    .click();
  await page
    .getByRole("status")
    .getByText(/已解除保护 uv 默认缓存目录/)
    .waitFor();
  await page.evaluate(() => {
    window.coverageMode = "mixed";
  });
  await scan(true);
  const coverage = page.getByRole("region", { name: "本次统计不完整" });
  await coverage.getByText("目录不存在 · 1 个位置", { exact: true }).waitFor();
  await coverage.getByText("尚未访问 · 1 个位置", { exact: true }).waitFor();
  await coverage.getByText("为什么不完整？如何处理？", { exact: true }).click();
  if (await coverage.getByRole("button", { name: "检查系统访问权限" }).count())
    throw new Error("未确认权限拒绝却出现授权操作");
  await page
    .getByRole("checkbox", { name: "选择uv 缓存", exact: true })
    .check();
  await page.getByRole("button", { name: /预览清理计划/ }).click();
  const plan = page.getByRole("dialog", { name: "确认这次清理" });
  await plan
    .getByText("预览已重新查询 uv 配置并复核元数据", { exact: true })
    .waitFor();
  await plan.getByRole("checkbox").check();
  await plan.getByRole("button", { name: "确认清理", exact: true }).click();
  await page.getByText("磁盘可用空间减少", { exact: false }).first().waitFor();
  await page.getByText("跳过 · 其他缓存", { exact: true }).click();
  await page.getByText("完成 · uv 缓存", { exact: true }).click();
  await page.getByText("执行后观测 4 KiB", { exact: false }).waitFor();
  await page.getByText("已重新测量，仍有剩余数据", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/playwright/cleanup-trust-092-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /清理记录/ }).click();
  await page.getByText("完成 · 旧缓存", { exact: true }).waitFor();
  await page.getByText("磁盘可用空间减少", { exact: false }).last().waitFor();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "通过：uv 规则依据、恢复条件、保护保存失败与持久化模拟、保护后不可选择、解除保护、覆盖分类、无误导授权、预览证据、跳过状态、执行后剩余观测、磁盘负变化与旧历史兼容。全部模拟 IPC。",
  );
};
