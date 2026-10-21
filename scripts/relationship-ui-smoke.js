async (page) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.relationCalls = [];
    window.relationMode = "complete";
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.relationCalls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info")
          return { total: 1000, available: 400, used: 500, shared: 100 };
        if (cmd === "cleanup_history") return [];
        if (cmd !== "scan_projects") throw new Error(`关系图不应调用 ${cmd}`);
        const legacy = window.relationMode === "legacy";
        return {
          root: args.root,
          measuredAt: Date.now(),
          durationMs: 240,
          complete: window.relationMode !== "partial",
          issues: 0,
          cancelled: false,
          warnings:
            window.relationMode === "partial"
              ? ["扫描受限，部分关系可能遗漏。"]
              : [],
          baselineAt: null,
          changes: [],
          projects:
            window.relationMode === "empty"
              ? []
              : ["a/app", "b/app"].map((path, index) => ({
                  path,
                  name: "同名项目",
                  languages: ["Python"],
                  artifacts: legacy
                    ? []
                    : [
                        {
                          name: ".venv",
                          bytes: 4096,
                          files: 3,
                          complete: index === 0,
                          recovery: "需重建虚拟环境；私有源可能不可达。",
                        },
                      ],
                  evidence: legacy
                    ? [
                        {
                          kind: "model",
                          message:
                            "旧版文字提到了 phantom:7b，但没有结构字段。",
                        },
                      ]
                    : [
                        {
                          kind: "process",
                          pid: 42,
                          message: "PID 42 的可执行路径指向项目。",
                        },
                        {
                          kind: "model",
                          model: "qwen:7b",
                          source: ".env",
                          message: ".env 引用模型 qwen:7b；不代表实际调用。",
                        },
                        {
                          kind: "model",
                          model: "qwen:7b",
                          source: "config.yaml",
                          message:
                            "config.yaml 引用模型 qwen:7b；不代表实际调用。",
                        },
                        ...(index === 0
                          ? Array.from({ length: 14 }, (_, i) => ({
                              kind: "model",
                              model: `model-${i}:7b`,
                              source: "config.yaml",
                              message: "配置引用，不代表使用。",
                            }))
                          : []),
                        {
                          kind: "unknown",
                          message: "未发现引用不代表没有依赖。",
                        },
                      ],
                })),
        };
      },
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:1420");
  await page.getByRole("button", { name: "项目账本", exact: true }).click();
  await page.getByRole("button", { name: "扫描项目", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page.getByRole("button", { name: "开始项目扫描", exact: true }).click();
  const graph = page.getByRole("region", {
    name: "项目直接关系图",
    exact: true,
  });
  await graph.waitFor();
  if ((await graph.locator(".relation-node").count()) !== 13)
    throw new Error("默认中心加 12 个直接邻居");
  await graph
    .getByRole("button", { name: "显示更多关系", exact: false })
    .click();
  if ((await graph.locator(".relation-node").count()) !== 18)
    throw new Error("关系分页错误");
  const model = graph.getByRole("button", {
    name: "查看本地模型关系：qwen:7b",
    exact: true,
  });
  await model.focus();
  await page.keyboard.press("Enter");
  if (
    (await graph.locator(".relation-node.model").count()) !== 1 ||
    (await graph.locator(".relation-node.project").count()) !== 2
  )
    throw new Error("共享模型应只展示一次，并关联两个不同路径的同名项目");
  await graph
    .locator(".relation-inspector")
    .getByText("Ollama · 占用未测量", { exact: true })
    .waitFor();
  const edge = graph.locator(".relation-list button").first();
  await edge.focus();
  await page.keyboard.press("Enter");
  const info = graph.locator(".relation-inspector");
  if (
    !(await info.innerText()).includes("config.yaml") ||
    !(await info.innerText()).includes(".env")
  )
    throw new Error("必须展示同一关联的两个配置来源");
  await page.screenshot({
    path: "output/playwright/relationships-040.png",
    fullPage: true,
  });
  await graph
    .getByRole("button", { name: "返回所选项目", exact: true })
    .click();
  await graph
    .getByRole("button", { name: "查看产物目录关系：.venv", exact: true })
    .click();
  await info
    .getByText("需重建虚拟环境；私有源可能不可达。", { exact: true })
    .waitFor();
  if ((await graph.locator(".relation-node.process").count()) !== 0)
    throw new Error("不能推断进程直接使用虚拟环境");
  await graph
    .getByRole("button", { name: "返回所选项目", exact: true })
    .click();
  await graph
    .getByRole("button", { name: "查看可见进程关系：PID 42", exact: true })
    .click();
  if ((await graph.locator(".relation-node.project").count()) !== 2)
    throw new Error("共享进程应显示两个项目路径线索");
  await graph.getByLabel("选择项目 2 个").fill("b/app");
  const projects = graph.locator(".relation-project-list button");
  if ((await projects.count()) !== 1) throw new Error("项目路径搜索错误");
  await projects.first().click();
  await graph
    .getByRole("button", { name: "查看产物目录关系：.venv", exact: true })
    .click();
  await info.getByText("占用仅为下限", { exact: false }).waitFor();
  await page.setViewportSize({ width: 960, height: 820 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("最小窗口宽度发生横向溢出");
  await page.screenshot({
    path: "output/playwright/relationships-040-min.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "账本列表", exact: true }).click();
  if ((await page.locator(".project-card").count()) !== 2)
    throw new Error("账本列表必须保留");
  await page.getByRole("button", { name: "关系图", exact: true }).click();
  await page.evaluate(() => {
    window.relationMode = "partial";
  });
  await page.getByRole("button", { name: "扫描项目", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page.getByRole("button", { name: "开始项目扫描", exact: true }).click();
  await page
    .locator(".relation-intro .badge")
    .getByText("部分扫描", { exact: false })
    .waitFor();
  await page.evaluate(() => {
    window.relationMode = "legacy";
  });
  await page.getByRole("button", { name: "扫描项目", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page.getByRole("button", { name: "开始项目扫描", exact: true }).click();
  await graph.getByText("尚未发现可绘制的直接关系", { exact: false }).waitFor();
  if (await graph.locator(".relation-node.model").count())
    throw new Error("不得从旧消息猜测模型身份");
  await page.evaluate(() => {
    window.relationMode = "empty";
  });
  await page.getByRole("button", { name: "扫描项目", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
    .check();
  await page.getByRole("button", { name: "开始项目扫描", exact: true }).click();
  await page.getByText("还没有可展示的项目关系", { exact: true }).waitFor();
  const calls = await page.evaluate(() => window.relationCalls);
  if (calls.some((c) => ["prepare_cleanup", "execute_cleanup"].includes(c.cmd)))
    throw new Error("关系图不得触发清理");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "关系图界面通过：共享模型、同名项目、PID、节点切换、多来源、键盘、分页、搜索、未知占用、部分扫描、旧数据、空报告、账本切换和最小窗口。全部模拟 IPC，无删除。",
  );
};
