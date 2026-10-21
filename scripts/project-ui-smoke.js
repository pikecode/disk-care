async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.projectCalls = [];
    window.projectMode = "complete";
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.projectCalls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info")
          return { total: 1000, available: 400, used: 500, shared: 100 };
        if (cmd === "cleanup_history") return [];
        if (cmd === "cancel_scan") {
          window.finishProject?.();
          return;
        }
        if (cmd !== "scan_projects") throw new Error("不应调用 " + cmd);
        if (window.projectMode === "error") throw "工作目录不可读取";
        const partial = window.projectMode === "cancel";
        if (partial)
          await new Promise((resolve) => {
            window.finishProject = resolve;
          });
        return {
          root: args.root,
          measuredAt: 1792374000000,
          durationMs: 650,
          complete: !partial,
          issues: partial ? 1 : 0,
          cancelled: partial,
          warnings: partial ? ["结果为部分观测；本次不更新完整基线。"] : [],
          baselineAt: partial ? null : 1792370000000,
          changes: partial
            ? []
            : [{ path: "服务-0/target", before: 1024, after: 2048 }],
          projects: Array.from({ length: 52 }, (_, index) => ({
            path: `服务-${index}`,
            name: `服务-${index}`,
            languages: index === 0 ? ["Rust"] : ["Node"],
            artifacts: [
              {
                name: index === 0 ? "target" : "node_modules",
                bytes: 2048,
                files: 4,
                complete: true,
                recovery: "需要重新构建；不保证恢复手动文件。",
              },
            ],
            evidence: [
              {
                kind: "model",
                model: "qwen:7b",
                source: "config.yaml",
                message: "config.yaml 引用模型 qwen:7b；不证明实际调用。",
              },
              { kind: "unknown", message: "未匹配不代表没有依赖。" },
            ],
          })),
        };
      },
    };
  });
  await page.goto("http://127.0.0.1:1420");
  await page.getByRole("button", { name: "项目账本", exact: true }).click();
  await page.getByLabel("工作目录 项目按指定目录扫描").fill("~/Projects");
  await page.getByRole("button", { name: "扫描项目", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page.getByRole("button", { name: "开始项目扫描", exact: true }).click();
  await page.getByText("已测量产物目录", { exact: true }).waitFor();
  if ((await page.locator(".relation-project-list button").count()) !== 50)
    throw new Error("关系图项目列表首次应展示 50 项");
  await page.getByRole("button", { name: "更多项目", exact: false }).click();
  if ((await page.locator(".relation-project-list button").count()) !== 52)
    throw new Error("关系图项目分页错误");
  await page.getByRole("button", { name: "账本列表", exact: true }).click();
  if ((await page.locator(".project-card").count()) !== 50)
    throw new Error("首次只显示 50 个项目");
  await page.getByRole("button", { name: "继续显示", exact: false }).click();
  if ((await page.locator(".project-card").count()) !== 52)
    throw new Error("加载更多未完成");
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  if ((await page.locator(".project-card").count()) !== 1)
    throw new Error("语言筛选错误");
  await page.locator(".project-evidence summary").click();
  await page.getByText("config.yaml 引用模型", { exact: false }).waitFor();
  await page.locator(".artifact-list summary").click();
  await page.getByText("需要重新构建", { exact: false }).waitFor();
  await page.getByLabel("搜索项目").fill("不存在");
  await page.getByText("没有匹配的项目", { exact: true }).waitFor();
  await page.getByLabel("搜索项目").fill("");
  await page.locator(".ledger-changes summary").click();
  await page.getByText("服务-0/target", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/playwright/projects-030.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "查看缓存清理", exact: true }).click();
  await page.getByRole("button", { name: "开始扫描", exact: true }).waitFor();
  await page.getByRole("button", { name: "项目账本", exact: true }).click();
  if (
    (await page.getByLabel("工作目录 项目按指定目录扫描").inputValue()) !==
    "~/Projects"
  )
    throw new Error("切换页面丢失工作目录");
  await page.evaluate(() => {
    window.projectMode = "cancel";
  });
  await page.getByRole("button", { name: "扫描项目", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page.getByRole("button", { name: "开始项目扫描", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "扫描项目", exact: true })
      .isEnabled()
  )
    throw new Error("扫描中必须禁用重复任务");
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await page
    .getByText("本次扫描不完整，不计算增减，也不覆盖上次完整基线。", {
      exact: true,
    })
    .waitFor();
  await page.evaluate(() => {
    window.projectMode = "error";
  });
  await page.getByRole("button", { name: "扫描项目", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page.getByRole("button", { name: "开始项目扫描", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "工作目录不可读取" })
    .waitFor();
  const calls = await page.evaluate(() => window.projectCalls);
  if (
    calls.some(
      (c) => c.cmd === "execute_cleanup" || c.cmd === "prepare_cleanup",
    )
  )
    throw new Error("项目分析不得触发删除");
  if (calls.filter((c) => c.cmd === "scan_projects").length !== 3)
    throw new Error("项目扫描调用次数错误");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "项目界面通过：扫描、分页、筛选、搜索、影响证据、恢复说明、基线变化、切页保留、缓存入口、取消、失败与删除边界。全部使用模拟 IPC。",
  );
};
