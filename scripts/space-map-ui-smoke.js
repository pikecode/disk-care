async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.spaceCalls = [];
    window.spaceMode = "complete";
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.spaceCalls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info")
          return { total: 1000, available: 400, used: 500, shared: 100 };
        if (cmd === "cleanup_history") return [];
        if (cmd !== "scan_projects") throw new Error(`空间地图不应调用 ${cmd}`);
        const zero = window.spaceMode === "zero";
        return {
          root: args.root,
          measuredAt: Date.now(),
          durationMs: 270,
          complete: window.spaceMode !== "partial",
          issues: 0,
          cancelled: false,
          warnings: [],
          baselineAt: null,
          changes: [],
          projects:
            window.spaceMode === "empty"
              ? []
              : Array.from({ length: zero ? 2 : 85 }, (_, index) => ({
                  path: `team-${index}/app`,
                  name:
                    index === 0
                      ? "前端工作台"
                      : index === 1
                        ? "Rust工作台"
                        : index === 2
                          ? "零产物项目"
                          : `工具项目-${index}`,
                  languages: [
                    index === 0 ? "Node" : index === 1 ? "Rust" : "Python",
                  ],
                  artifacts:
                    zero || index === 2
                      ? []
                      : index === 0
                        ? [
                            {
                              name: "node_modules",
                              bytes: 6 * 1024 ** 3,
                              files: 123,
                              complete: true,
                              recovery: "重装可能需要网络和私有仓库凭据。",
                            },
                            {
                              name: "dist",
                              bytes: 2 * 1024 ** 3,
                              files: 12,
                              complete: true,
                              recovery: "需检查构建流程，可能混有手动文件。",
                            },
                          ]
                        : [
                            {
                              name: "target",
                              bytes:
                                index === 1
                                  ? 2 * 1024 ** 3
                                  : (90 - index) * 10 * 1024 ** 2,
                              files: 5,
                              complete: true,
                              recovery: "需要重新编译，不保证恢复手动文件。",
                            },
                          ],
                  evidence: [
                    { kind: "unknown", message: "未发现引用不代表没有依赖。" },
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
  await page.getByRole("button", { name: "空间地图", exact: true }).click();
  const map = page.getByRole("region", { name: "项目空间地图", exact: true });
  await map.waitFor();
  if ((await map.locator(".space-cell").count()) !== 31)
    throw new Error("默认应为 30 项加聚合");
  const area = await map
    .locator(".space-cell")
    .evaluateAll((cells) =>
      cells.reduce(
        (n, cell) =>
          n + parseFloat(cell.style.width) * parseFloat(cell.style.height),
        0,
      ),
    );
  // 浏览器将 CSS 百分比序列化为有限有效位；纯布局断言另行严格核验。
  if (Math.abs(area - 10000) > 0.01) throw new Error("界面面积不守恒");
  await map.screenshot({ path: "output/playwright/space-map-050.png" });
  await map.getByLabel("本层对象 85 项").fill("team-84/app");
  if (
    (await map.locator(".space-map-list > button").count()) !== 1 ||
    (await map.locator(".space-cell").count()) !== 31
  )
    throw new Error("搜索应只过滤列表，保持地图面积口径");
  await map.getByLabel("本层对象 85 项").fill("");
  const frontend = map.getByRole("button", { name: /^选择项目：前端工作台/ });
  await frontend.focus();
  await page.keyboard.press("Enter");
  if ((await map.locator(".space-cell").count()) !== 2)
    throw new Error("项目展开应展示两个产物");
  await map.getByRole("button", { name: /^选择产物：dist/ }).click();
  await map
    .locator(".space-map-details")
    .getByText("需检查构建流程，可能混有手动文件。", { exact: true })
    .waitFor();
  await map.getByRole("button", { name: "返回上层", exact: true }).click();
  await map.getByRole("button", { name: /^选择聚合：其他/ }).click();
  if ((await map.locator(".space-map-list > button").count()) !== 50)
    throw new Error("聚合层应保留文字分页");
  await map.getByRole("button", { name: "继续显示对象", exact: false }).click();
  if ((await map.locator(".space-map-list > button").count()) !== 54)
    throw new Error("聚合没有保留剩余项目");
  await map.getByRole("button", { name: "全部项目", exact: true }).click();
  await map.getByLabel("本层对象 85 项").fill("team-2/app");
  await map
    .getByRole("button", { name: "从列表选择项目：team-2/app", exact: true })
    .click();
  await map.getByText("没有可绘制的正占用数据", { exact: true }).waitFor();
  await map.getByRole("button", { name: "全部项目", exact: true }).click();
  await map.getByRole("button", { name: /^选择项目：Rust工作台/ }).click();
  await map.getByRole("button", { name: /^选择产物：target/ }).click();
  await map.getByRole("button", { name: "查看项目关系", exact: true }).click();
  await page
    .locator(".relation-node.central")
    .getByText("Rust工作台", { exact: true })
    .waitFor();
  if (
    await page
      .locator(".relation-node.central")
      .getByText("前端工作台", { exact: true })
      .count()
  )
    throw new Error("关系联动错误回到了第一个项目");
  await page.getByRole("button", { name: "空间地图", exact: true }).click();
  await page.setViewportSize({ width: 960, height: 820 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("最小窗口发生横向溢出");
  await map.screenshot({ path: "output/playwright/space-map-050-min.png" });
  for (const mode of ["partial", "zero", "empty"]) {
    await page.evaluate((value) => {
      window.spaceMode = value;
    }, mode);
    await page.getByRole("button", { name: "扫描项目", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "我已了解范围与权限要求，继续扫描" })
      .check();
    await page
      .getByRole("button", { name: "开始项目扫描", exact: true })
      .click();
    if (mode === "partial")
      await map
        .getByText("本次扫描不完整，面积仅表示已读取部分", { exact: false })
        .waitFor();
    else
      await map.getByText("没有可绘制的正占用数据", { exact: true }).waitFor();
  }
  const calls = await page.evaluate(() => window.spaceCalls);
  if (calls.some((c) => ["prepare_cleanup", "execute_cleanup"].includes(c.cmd)))
    throw new Error("地图不应触发清理");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "空间地图检查通过：面积、聚合、展开、返回、搜索、列表分页、零占用、键盘、恢复说明、跨视图项目定位、部分/空报告与最小窗口。全部模拟 IPC，无删除。",
  );
};
