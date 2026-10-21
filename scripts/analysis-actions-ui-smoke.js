async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.actionCalls = [];
    const base = {
      category: "开发缓存",
      path: "/fixture/cache",
      bytes: 1024 ** 3,
      files: 5,
      issues: 0,
      complete: true,
      blocked: null,
      command: "官方缓存清理命令",
      impact: "重新安装可能需要网络。",
      details: [],
    };
    const items = [
      { ...base, id: "npm", name: "npm 下载缓存" },
      { ...base, id: "uv", name: "uv 缓存", category: "工具环境" },
      {
        ...base,
        id: "pip",
        name: "pip 缓存",
        blocked: "PID 77 正在使用，请先核对运行依赖。",
      },
      {
        ...base,
        id: "ollama",
        name: "Ollama 模型",
        category: "模型与数据",
        command: null,
        blocked: "此项仅分析",
      },
      {
        ...base,
        id: "docker",
        name: "Docker 数据",
        category: "模型与数据",
        command: null,
        blocked: "此项仅分析",
      },
      {
        ...base,
        id: "downloads",
        name: "下载文件",
        category: "个人文件",
        command: null,
        blocked: "此项仅分析",
      },
    ];
    const disk = {
      total: 100000000000,
      available: 20000000000,
      used: 70000000000,
      shared: 10000000000,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.actionCalls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info") return disk;
        if (cmd === "cleanup_history") return [];
        if (cmd === "scan_disk")
          return {
            id: Date.now(),
            disk,
            items,
            roots: [],
            durationMs: 100,
            cancelled: false,
          };
        if (cmd === "prepare_cleanup")
          return {
            token: 1000,
            createdAt: Date.now(),
            items: items.filter((i) => args.ids.includes(i.id)),
            estimated: args.ids.length * 1024 ** 3,
          };
        throw new Error(`此流程不应调用 ${cmd}`);
      },
    };
  });
  await page.setViewportSize({ width: 1180, height: 900 });
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
  const states = page.getByRole("group", {
    name: "按处理状态筛选",
    exact: true,
  });
  const categories = page.getByRole("group", {
    name: "按类型筛选",
    exact: true,
  });
  await page
    .getByRole("checkbox", { name: "选择uv 缓存", exact: true })
    .check();
  await categories
    .getByRole("button", { name: "个人文件", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "查看可预览缓存", exact: true })
    .click();
  if (
    (await categories
      .getByRole("button", { name: "全部", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    throw new Error("概览联动必须重置用途分类");
  if ((await page.locator(".item-row").count()) !== 2)
    throw new Error("可预览分类只显示两个合格项");
  await categories
    .getByRole("button", { name: "开发缓存", exact: true })
    .click();
  if ((await page.locator(".item-row").count()) !== 1)
    throw new Error("双筛选应仅显示 npm");
  await page
    .getByText("其中 1 项不在当前筛选中，预览将完整列出", { exact: true })
    .waitFor();
  const all = page.getByRole("checkbox", {
    name: "选择全部可清理项",
    exact: true,
  });
  await all.check();
  await page.getByText("已选择 2 项", { exact: true }).waitFor();
  await all.uncheck();
  await page.getByText("已选择 1 项", { exact: true }).waitFor();
  await panel
    .getByRole("button", { name: "查看仅供分析项目", exact: true })
    .click();
  if ((await page.locator(".item-row").count()) !== 3)
    throw new Error("只读分类必须正确列出三项");
  if (await all.isEnabled()) throw new Error("只读视图不能全选隐藏的合格项");
  if (
    await page
      .getByRole("checkbox", { name: "选择Docker 数据", exact: true })
      .isEnabled()
  )
    throw new Error("只读项不能选择");
  await page
    .getByRole("button", { name: "查看Docker 数据详情", exact: true })
    .click();
  await page.getByText("先识别容器数据对象", { exact: true }).waitFor();
  await page.getByRole("button", { name: "预览清理计划", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator(".plan-items strong")
    .filter({ hasText: "uv 缓存" })
    .waitFor();
  const prepare = await page.evaluate(() =>
    window.actionCalls.filter((c) => c.cmd === "prepare_cleanup"),
  );
  if (prepare.length !== 1 || prepare[0].args.ids.join(",") !== "uv")
    throw new Error("预览必须包含原先明确选择的隐藏项，且不能添加只读项");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await panel
    .getByRole("button", { name: "查看暂不可处理项目", exact: true })
    .click();
  if ((await page.locator(".item-row").count()) !== 1)
    throw new Error("受阻分类应只有 pip");
  await page
    .getByRole("button", { name: "查看pip 缓存详情", exact: true })
    .click();
  await page.getByText("先核对阻止原因", { exact: true }).waitFor();
  await states.getByRole("button", { name: /^零观测/ }).click();
  await page.getByText("当前筛选没有匹配项目。", { exact: true }).waitFor();
  await panel
    .getByRole("button", { name: "查看仅供分析项目", exact: true })
    .click();
  await page
    .getByRole("button", { name: "查看Ollama 模型详情", exact: true })
    .click();
  await page.getByText("先确认模型用途", { exact: true }).waitFor();
  await page.setViewportSize({ width: 960, height: 820 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("最小窗口横向溢出");
  await page
    .locator(".inventory")
    .screenshot({ path: "output/playwright/analysis-actions-070.png" });
  await page.getByRole("button", { name: "查看项目账本", exact: true }).click();
  await page
    .getByRole("heading", { name: "项目空间", exact: true })
    .waitFor();
  const calls = await page.evaluate(() => window.actionCalls);
  if (calls.some((c) => ["execute_cleanup", "scan_projects"].includes(c.cmd)))
    throw new Error("筛选与跳转不能触发删除或自动扫描");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "分析操作检查通过：分类联动、双筛选、可见全选、隐藏选择、预览完整性、只读禁选、处理建议、模型跳转、空筛选和最小窗口。全部模拟 IPC，无删除。",
  );
};
