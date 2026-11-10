async (page) => {
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.calls = [];
    window.directoryMode = 'full';
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    const root = { id: 'root-home', name: '用户主目录', category: '主要目录', path: '/Users/fixture',
      bytes: 1000 * 1024 ** 2, files: 300, complete: true, issues: 0, command: null, blocked: '仅分析', impact: '只读', details: [] };
    const entry = (id, name, category, bytes) => ({ ...root, id, name, category, path: `/Users/fixture/${id}`, bytes });
    const listing = args => {
      const empty = window.directoryMode === 'empty';
      const partial = window.directoryMode === 'partial';
      const inner = args.relative === 'music';
      const items = empty ? [] : inner ? [entry('music/payload', '音乐文件', '文件', 200 * 1024 ** 2)]
        : args.offset ? [entry('last', '末页文件', '文件', 100 * 1024 ** 2)] : [entry('music', '音乐目录', '目录', 800 * 1024 ** 2), entry('movie', '电影文件', '文件', 100 * 1024 ** 2)];
      const result = { items, nextOffset: !empty && !partial && !inner && !args.offset ? 200 : null,
        total: empty ? 0 : inner ? 1 : 201, measuredAt: 123456, complete: !partial, issues: partial ? 1 : 0 };
      if (window.directoryMode === 'legacy') return result;
      return { ...result,
        mapItems: empty ? [] : inner ? items : [entry('music', '音乐目录', '目录', 800 * 1024 ** 2), entry('movie', '电影文件', '文件', 100 * 1024 ** 2)], otherBytes: !empty && !inner ? 100 * 1024 ** 2 : 0, otherCount: !empty && !inner ? 199 : 0,
        coverage: { status: partial ? 'limited' : 'complete', permissionDenied: 0, excluded: 0, limited: partial, cancelled: false, diagnostics: [] },
        largeFilesTotal: empty ? 0 : 160,
        largeFiles: empty ? [] : Array.from({ length: 60 }, (_, index) => ({
          path: `/Users/fixture/media/${index === 0 ? 'movie-0.mp4' : `setup-${index}.dmg`}`,
          relative: `media/${index === 0 ? 'movie-0.mp4' : `setup-${index}.dmg`}`,
          logicalBytes: (500 - index) * 1024 ** 2, allocatedBytes: index === 0 ? 0 : 8 * 1024 ** 2,
          modifiedAt: index === 0 ? 1 : null,
        })),
      };
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      async invoke(cmd, args) {
        window.calls.push({ cmd, args });
        if (cmd === "scan_roots") return [{ id: "root-home", name: "用户主目录", path: "/Users/fixture" }, { id: "root-shared", name: "共享用户文件", path: "/Users/Shared" }];
        if (cmd.startsWith('plugin:event|')) return 1;
        if (cmd === 'disk_info') return { total: 10000, used: 5000, available: 5000, shared: 0 };
        if (cmd === 'cleanup_history') return [];
        if (cmd === 'scan_disk') return { id: Date.now(), extended: true, disk: { total: 10000, used: 5000, available: 5000, shared: 0 },
          items: [], roots: [root], cancelled: false, durationMs: 1 };
        if (cmd === 'list_children') {
          if (window.directoryMode === 'pending') await new Promise(resolve => { window.finishDirectory = resolve; });
          return listing(args);
        }
        if (cmd === 'reveal_observed_file') { if (window.revealError) throw '合成：观测已过期'; return; }
        if (cmd === 'cancel_scan') { window.finishDirectory?.(); return; }
        throw new Error(`只读浏览未预期调用：${cmd}`);
      },
    };
  });
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto('http://127.0.0.1:1420');
  await page.getByRole('button', { name: '开始检查', exact: true }).click();
  await page.getByRole('radio', { name: '扩展扫描：主要目录与应用数据' }).check();
  await page.getByRole('checkbox', { name: '我已了解范围与权限要求，继续扫描' }).check();
  await page.getByRole('button', { name: '开始扩展扫描', exact: true }).click();
  const overview = page.getByRole('region', { name: '主要目录总览' });
  await overview.locator('summary').click();
  const open = () => overview.getByRole('button', { name: /用户主目录/ }).click();
  await open();
  const dialog = page.getByRole('dialog', { name: '用户主目录', exact: true });
  await dialog.getByRole('button', { name: '音乐目录' }).waitFor();
  const initial = await page.evaluate(() => window.calls.length);
  await dialog.getByRole('button', { name: '空间地图', exact: true }).click();
  await dialog.getByRole('button', { name: /其他 199 项，/ }).waitFor();
  await dialog.locator('.directory-map').getByRole('button', { name: /电影文件，/ }).click();
  await dialog.getByRole('region',{name:'目录对象详情'}).getByText(/只查看元数据/).waitFor();
  if (await page.evaluate(() => window.calls.length) !== initial) throw new Error('切换地图／选择文件触发额外 IPC');
  await dialog.locator('.directory-map').getByRole('button', { name: /音乐目录，/ }).click();
  if(await page.evaluate(()=>window.calls.length)!==initial)throw new Error('选中目录即下钻');
  await dialog.getByRole('button',{name:'打开文件夹',exact:true}).click();
  await dialog.getByRole('navigation', { name: '目录层级' }).getByText('music', { exact: true }).waitFor();
  if (await dialog.getByRole('button', { name: '空间地图', exact: true }).getAttribute('aria-pressed') !== 'true') throw new Error('逐层地图丢失视图');
  await dialog.getByRole('button', { name: '起始目录', exact: true }).click();
  await dialog.locator('.directory-map').getByRole('button', { name: /其他 199 项，/ }).click();
  await dialog.getByRole('button', { name: '继续加载', exact: true }).click();
  await dialog.getByRole('button', { name: /末页文件/ }).waitFor();
  await dialog.getByRole('button', { name: '大文件', exact: true }).click();
  if (await dialog.locator('.directory-files li').count() !== 50) throw new Error('大文件首屏上限错误');
  await dialog.getByRole('button', { name: '再显示 50 个文件' }).click();
  if (await dialog.locator('.directory-files li').count() !== 60) throw new Error('大文件分页错误');
  const beforeSelection=await page.evaluate(()=>window.calls.length);
  const lastFile=dialog.getByRole('button',{name:'选择文件 media/setup-59.dmg',exact:true});
  await lastFile.focus();await page.keyboard.press('Enter');
  await dialog.getByRole('region',{name:'大文件详情'}).getByRole('heading',{name:'setup-59.dmg',exact:true}).waitFor();
  if(await page.evaluate(()=>window.calls.length)!==beforeSelection)throw new Error('选择文件触发读取或定位');
  await page.screenshot({path:'output/playwright/space-file-inspector.png',fullPage:true});
  const beforeFilter = await page.evaluate(() => window.calls.length);
  await dialog.getByLabel('搜索大文件').fill('movie-0');
  await dialog.getByLabel('文件类型', { exact: true }).selectOption('video');
  await dialog.getByLabel('修改早于', { exact: true }).fill('2020-01-01');
  if (await dialog.locator('.directory-files li').count() !== 1) throw new Error('本地筛选错误');
  if (await page.evaluate(() => window.calls.length) !== beforeFilter) throw new Error('本地筛选触发额外 IPC');
  await dialog.getByRole('region',{name:'大文件详情'}).getByRole('heading',{name:'movie-0.mp4',exact:true}).waitFor();
  await dialog.getByRole('button', { name: '在 Finder 中定位', exact: true }).click();
  const reveal = await page.evaluate(() => window.calls.filter(call => call.cmd === 'reveal_observed_file'));
  if (reveal.length !== 1 || reveal[0].args.relative !== 'media/movie-0.mp4' || reveal[0].args.measuredAt !== 123456) throw new Error('显式 Finder 请求错误');
  await page.evaluate(() => { window.revealError = true; });
  await dialog.getByRole('button', { name: '在 Finder 中定位', exact: true }).click();
  await dialog.getByRole('alert').getByText('合成：观测已过期', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '列表', exact: true }).focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: '音乐目录' }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('960px 页面横向溢出');
  await dialog.getByRole('button', { name: '空间地图', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/directory-map.png', fullPage: true });
  await dialog.getByRole('button', { name: '关闭目录浏览' }).click();
  for (const mode of ['partial', 'empty', 'legacy']) {
    await page.evaluate(value => { window.directoryMode = value; }, mode);
    await open();
    await dialog.getByRole('button', { name: '空间地图', exact: true }).click();
    if (mode === 'partial') await dialog.getByText(/统计不完整/).first().waitFor();
    if (mode === 'empty') await dialog.getByText(/没有可绘制的正占用子项/).waitFor();
    if (mode === 'legacy') {
      await dialog.getByText('旧版结果未包含全层地图，请重新打开目录。', { exact: true }).waitFor();
      if (await dialog.getByText(/子项观测合计/).count()) throw new Error('未知地图被报告成零占用');
    }
    await dialog.getByRole('button', { name: '大文件', exact: true }).click();
    if (mode === 'legacy') await dialog.getByText('旧版结果未包含大文件，请重新打开目录。', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '关闭目录浏览' }).click();
  }
  await page.evaluate(() => { window.directoryMode = 'pending'; });
  await open();
  await dialog.getByRole('button', { name: '停止统计' }).waitFor();
  await dialog.getByRole('button', { name: '关闭目录浏览' }).click();
  await page.waitForTimeout(100);
  if (await page.getByRole('dialog').count() && await dialog.isVisible()) throw new Error('关闭后迟到结果重开对话框');
  if (await page.evaluate(() => window.calls.some(call => /prepare_cleanup|execute_cleanup/.test(call.cmd)))) throw new Error('只读流程触发清理');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('通过：全层地图／聚合、逐层返回、文件只读、列表分页、大文件分页／筛选、显式 Finder／错误、部分／空／旧数据、关闭取消、键盘、960px、零清理。全部模拟 IPC。');
}
