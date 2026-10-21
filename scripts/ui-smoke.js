async (page) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const item = {
      id: "npm",
      name: "npm 下载缓存",
      category: "开发缓存",
      path: "/Users/fixture/.npm/_cacache",
      bytes: 1048576,
      files: 10,
      issues: 0,
      complete: true,
      impact: "下次安装依赖需重新下载。",
      command: "npm cache clean --force --cache /Users/fixture/.npm",
      blocked: null,
      details: [],
    };
    const disk = {
      total: 500000000000,
      available: 73000000000,
      used: 380000000000,
      shared: 47000000000,
    };
    window.isTauri = true;
    window.fixtureCalls = [];
    window.fixtureFail = false;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() {
        return 1;
      },
      async invoke(cmd, args) {
        window.fixtureCalls.push({ cmd, args });
        if (cmd.startsWith("plugin:event|")) return 1;
        if (cmd === "disk_info") return disk;
        if (cmd === "cleanup_history") return [];
        if (cmd === "scan_disk")
          return {
            id: 100,
            disk,
            items: [
              item,
              {
                ...item,
                id: "downloads",
                name: "下载文件",
                category: "个人文件",
                command: null,
                blocked: "此项仅分析",
              },
            ],
            roots: [
              {
                ...item,
                id: "root-home",
                name: "用户主目录",
                path: "/Users/fixture",
                bytes: 10485760,
                command: null,
                blocked: "仅分析",
              },
            ],
            durationMs: 100,
            cancelled: false,
          };
        if (cmd === "prepare_cleanup")
          return {
            token: 200,
            createdAt: Date.now(),
            estimated: item.bytes,
            items: [item],
          };
        if (cmd === "execute_cleanup") {
          if (window.fixtureFail) throw "测试错误：预览已失效，请重新预览";
          return {
            at: Date.now(),
            estimated: item.bytes,
            released: 524288,
            beforeAvailable: disk.available,
            afterAvailable: disk.available + 524288,
            outcomes: [
              {
                name: item.name,
                success: true,
                message: "测试夹具执行成功，没有清理真实数据",
              },
            ],
            warning: null,
          };
        }
        if (cmd === "list_children")
          return {
            items:
              args.offset === 0
                ? Array.from({ length: 200 }, (_, n) => ({
                    ...item,
                    id: n === 0 ? "music" : `first-${n}`,
                    name: n === 0 ? "音乐目录" : `第一页文件${n}`,
                    category: n === 0 ? "目录" : "文件",
                    path: `/Users/fixture/${n}`,
                    bytes: n === 0 ? 8388608 : 1048576,
                  }))
                : [
                    {
                      ...item,
                      id: "file",
                      name: "第二页文件",
                      category: "文件",
                      path: "/Users/fixture/file",
                    },
                  ],
            nextOffset: args.offset === 0 ? 200 : null,
            total: 201,
            measuredAt: Date.now(),
            complete: true,
            issues: 0,
          };
        throw new Error("未预期的命令：" + cmd);
      },
    };
  });
  await page.reload();
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
  const selection = page.getByRole("checkbox", {
    name: "选择npm 下载缓存",
    exact: true,
  });
  await selection.waitFor();
  if (await selection.isChecked()) throw new Error("扫描结果不应自动选择");
  if (
    await page
      .getByRole("checkbox", { name: "选择下载文件", exact: true })
      .isEnabled()
  )
    throw new Error("只读项不应允许选择");
  const overview = page.getByRole("region", { name: "主要目录总览" });
  await overview.locator("summary").click();
  await overview.getByRole("button", { name: /用户主目录/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /音乐目录/ })
    .waitFor();
  await page.getByRole("button", { name: "继续加载", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /第二页文件/ })
    .waitFor();
  await page.getByRole("button", { name: "关闭目录浏览", exact: true }).click();
  const listingCalls = await page.evaluate(() =>
    window.fixtureCalls.filter((c) => c.cmd === "list_children"),
  );
  if (
    listingCalls.length !== 2 ||
    listingCalls[0].args.offset !== 0 ||
    listingCalls[1].args.offset !== 200
  )
    throw new Error("目录分页调用不正确");
  await selection.check();
  await page.getByRole("button", { name: "预览清理计划", exact: true }).click();
  await page
    .getByRole("dialog")
    .filter({ has: page.getByText("确认这次清理", { exact: true }) })
    .waitFor();
  if (
    await page
      .getByRole("button", { name: "确认清理", exact: true })
      .isEnabled()
  )
    throw new Error("未了解影响时不应允许执行");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  if (
    await page.evaluate(() =>
      window.fixtureCalls.some((c) => c.cmd === "execute_cleanup"),
    )
  )
    throw new Error("取消不应触发清理");
  await page.getByRole("button", { name: "预览清理计划", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已了解影响，确认清理以上缓存" })
    .check();
  await page.getByRole("button", { name: "确认清理", exact: true }).click();
  await page
    .getByText("命令均已完成，请查看核验结果", { exact: true })
    .waitFor();
  if (
    await page
      .getByRole("button", { name: "预览清理计划", exact: true })
      .count()
  )
    throw new Error("清理后必须使扫描结果失效并收起操作栏");
  await page.getByRole("button", { name: "清理记录 1", exact: true }).click();
  await page.getByText("完成 · npm 下载缓存", { exact: true }).waitFor();
  await page.getByRole("button", { name: "空间概览", exact: true }).click();
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
  await selection.check();
  await page.getByRole("button", { name: "预览清理计划", exact: true }).click();
  await page.evaluate(() => {
    window.fixtureFail = true;
  });
  await page
    .getByRole("checkbox", { name: "我已了解影响，确认清理以上缓存" })
    .check();
  await page.getByRole("button", { name: "确认清理", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "预览已失效" }).waitFor();
  if (await page.getByRole("dialog").isVisible())
    throw new Error("失败后旧确认计划必须关闭");
  const calls = await page.evaluate(() =>
    window.fixtureCalls.filter((c) => c.cmd === "execute_cleanup"),
  );
  if (calls.length !== 2 || calls.some((c) => c.args.token !== 200))
    throw new Error("清理调用次数或凭据不正确");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "界面检查通过：默认不选择、只读项禁选、预览确认、取消、执行、记录、结果失效与失败提示。目录总览与分页也已验证。全部使用模拟 IPC。",
  );
};
