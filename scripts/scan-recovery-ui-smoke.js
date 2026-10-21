async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.isTauri = true;
    window.calls = [];
    window.mode = "partial";
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
        if (cmd === "open_privacy_settings") throw "测试：系统设置无法打开";
        if (cmd === "scan_disk")
          return {
            id: Date.now(),
            disk,
            extended: args.extended,
            durationMs: 1,
            cancelled: window.mode === "cancelled",
            items: ["partial", "excluded"].includes(window.mode)
              ? [
                  {
                    id: "downloads",
                    name: "下载目录",
                    category: "个人文件",
                    path: "/Users/fixture/Downloads",
                    bytes: 0,
                    files: 0,
                    issues: window.mode === "excluded" ? 0 : 1,
                    complete: false,
                    coverage: {
                      status: window.mode === "excluded" ? "skipped" : "denied",
                      permissionDenied: window.mode === "excluded" ? 0 : 1,
                      excluded: window.mode === "excluded" ? 1 : 0,
                      limited: false,
                      cancelled: false,
                    },
                    blocked:
                      window.mode === "excluded"
                        ? "已主动跳过其他应用私有数据，未读取。"
                        : "测试：Operation not permitted",
                    command: null,
                    impact: "只读",
                    details: [],
                  },
                ]
              : [],
            roots: [],
          };
        throw new Error(cmd);
      },
    };
  });
  await page.goto("http://127.0.0.1:1420");
  await page.getByRole("button", { name: "开始扫描", exact: true }).click();
  await page
    .getByRole("radio", { name: "扩展扫描：主要目录与应用数据" })
    .check();
  await page.getByText("查看扩展扫描范围", { exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText("/Users/Shared", { exact: true })
    .waitFor();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /开始(常规|扩展)扫描/, exact: true })
    .click();
  const notice = page.getByRole("region", { name: "本次统计不完整" });
  await notice.waitFor();
  await notice.getByText("查看 1 个统计不完整的位置", { exact: true }).click();
  await notice.getByText("/Users/fixture/Downloads", { exact: true }).waitFor();
  await notice
    .getByText("测试：Operation not permitted", { exact: true })
    .waitFor();
  await notice.getByText("为什么不完整？如何处理？", { exact: true }).click();
  await notice.getByRole("button", { name: "检查系统访问权限" }).click();
  await notice
    .getByRole("alert")
    .getByText("测试：系统设置无法打开", { exact: true })
    .waitFor();
  const counts = await page.evaluate(
    () => window.calls.filter((c) => c.cmd === "scan_disk").length,
  );
  if (counts !== 1) throw new Error("打开系统设置触发自动复扫");
  await notice
    .getByText("增加授权也不会使这些目录被扫描", { exact: false })
    .waitFor();
  for (const mode of ["excluded", "cancelled", "complete"]) {
    await page.evaluate((m) => {
      window.mode = m;
    }, mode);
    await page
      .getByRole("button", { name: "重新扫描", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: /开始(常规|扩展)扫描/, exact: true })
      .click();
    if (mode === "excluded") {
      await notice.locator("summary").first().click();
      await notice
        .getByText("已主动跳过其他应用私有数据，未读取。", { exact: true })
        .waitFor();
      await notice.getByText("0 处读取问题", { exact: false }).waitFor();
      if (
        await notice.getByRole("button", { name: "检查系统访问权限" }).count()
      )
        throw new Error("主动跳过不应提供授权操作");
    } else if (mode === "cancelled") {
      await notice.getByText("扫描已停止；", { exact: false }).waitFor();
      if (await notice.locator("details").count())
        throw new Error("虚构未读取目录清单");
    } else {
      await notice.waitFor({ state: "detached" });
    }
  }
  const calls = await page.evaluate(() => window.calls);
  if (calls.some((c) => c.cmd === "execute_cleanup"))
    throw new Error("触发清理");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "范围明细、失败目录、原始原因、设置失败、无自动复扫、取消与完整结果验证通过",
  );
};
