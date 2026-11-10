async (page) => {
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.calls = [];
    window.aiMode = 'complete';
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    const report = (root) => ({
      tool: root.tool, root: root.path, source: '用户确认路径', measuredAt: Date.now(),
      version: '未验证', activity: '未知', notes: [], issues: 0,
      coverage: { permissionDenied: 0, excluded: 0, limited: false, cancelled: false, status: window.aiMode, diagnostics: window.aiMode === 'complete' ? undefined : Array.from({ length: 60 }, (_, i) => ({ path: `~/fixture/path-${i}\nname`, reason: i === 0 ? 'depthLimit' : 'link', message: '<fixture> 原始错误' })) }, logicalBytes: 1024, allocatedBytes: 4096,
      items: Array.from({ length: 55 }, (_, i) => ({
        group: `projects/fixture-${i}`, category: i === 0 ? '配置、记忆与恢复资料' : '会话与工作记录',
        policy: i === 0 ? 'protected' : 'review', ruleId: 'ai.fixture', ruleVersion: 1,
        evidence: '合成数据', impact: '保留资料', logicalBytes: 1024, allocatedBytes: 4096,
        files: 1, modifiedAt: null, cleanupEligible: false,
      })),
    });
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      async invoke(cmd, args) {
        window.calls.push({ cmd, args });
        if (cmd.startsWith('plugin:event|')) return 1;
        if (cmd === 'disk_info') return { total: 100000, available: 50000, used: 50000, shared: 0 };
        if (cmd === 'cleanup_history') return [];
        if (cmd === 'cancel_scan') { window.finishAi?.(); return; }
        if (cmd === 'analyze_ai_data') {
          if (window.aiMode === 'error') throw new Error('合成路径错误');
          if (window.aiMode === 'pending') await new Promise(resolve => { window.finishAi = resolve; });
          return args.roots.map(root => {
            const r = report(root);
            if (window.aiMode === 'pending') r.coverage.status = 'cancelled';
            if (r.coverage.status !== 'complete') { r.items = []; r.logicalBytes = null; r.allocatedBytes = null; r.notes = ['合成覆盖问题']; r.issues = 1; }
            return r;
          });
        }
        throw new Error(`未预期 IPC: ${cmd}`);
      },
    };
  });
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto('http://127.0.0.1:1420');
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'空间',exact:true}).click();
  await page.getByRole('button', { name: 'AI 数据', exact: true }).click();
  await page.getByText('自定义路径与检查说明',{exact:true}).click();
  await page.getByText('每工具最多30秒／10万条目／12层，总计60秒；达到上限时标记部分结果。',{exact:true}).waitFor();
  if (await page.evaluate(() => window.calls.some(c => c.cmd === 'analyze_ai_data'))) throw new Error('进入页面自动分析');
  await page.getByLabel('Claude Code', { exact: true }).uncheck();
  await page.getByLabel('Codex 数据目录').fill('~/custom-codex');
  const start = page.getByRole('button', { name: '开始只读分析' });
  await start.click();
  const result = page.getByRole('article', { name: 'codex 分析结果' });
  await result.getByText('范围内统计完成', { exact: true }).waitFor();
  await result.getByText('统计依据与占用对比',{exact:true}).click();
  await result.getByRole('button', { name: '设为会话基线' }).click();
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'空间',exact:true}).click();
  await page.getByRole('region', { name: '独立空间账本' }).waitFor();
  await page.getByRole('button', { name: '查看 AI 账本与基线' }).click();
  await result.getByRole('button', { name: '替换会话基线' }).waitFor();
  await page.getByLabel('Claude Code', { exact: true }).uncheck();
  await page.getByLabel('Codex 数据目录').fill('~/custom-codex');
  const roots = await page.evaluate(() => window.calls.find(c => c.cmd === 'analyze_ai_data').args.roots);
  if (roots.length !== 1 || roots[0].path !== '~/custom-codex') throw new Error('分析范围未传递');
  if (await result.locator('.coverage-diagnostics').count()) throw new Error('旧报告无诊断字段却展示详情');
  if (await result.locator('.ai-item').count() !== 50) throw new Error('首屏分页错误');
  await result.getByRole('button', { name: '再显示 50 项' }).click();
  if (await result.locator('.ai-item').count() !== 55) throw new Error('加载更多错误');
  await result.getByLabel('数据策略').selectOption('protected');
  if (await result.locator('.ai-item').count() !== 1) throw new Error('保护筛选错误');
  await result.locator('.ai-item').first().focus();
  await page.keyboard.press('Enter');
  await result.getByText('只读分析，本项未开放清理。', { exact: true }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('960px 溢出');
  await page.screenshot({ path: 'output/playwright/ai-data-m2.png', fullPage: true });
  for (const [mode, label] of [['absent', '目录不存在'], ['denied', '部分访问被拒绝'], ['limited', '达到分析上限'], ['failed', '读取或路径检查失败']]) {
    await page.evaluate(value => { window.aiMode = value; }, mode);
    await start.click();
    await result.getByText(label, { exact: true }).waitFor();
    await result.getByText('统计依据与占用对比',{exact:true}).click();
    if (await result.getByRole('button', { name: '替换会话基线' }).isEnabled()) throw new Error('部分报告可设置基线');
    if (await result.getByText('未取得统计', { exact: true }).count() !== 2) throw new Error('未知占用显示为零');
    const calls = await page.evaluate(() => window.calls.length);
    const diagnostics = result.locator('.coverage-diagnostics');
    await diagnostics.locator('summary').click();
    if (await diagnostics.locator('li').count() !== 50) throw new Error('诊断超过显示上限');
    await diagnostics.getByText('深度上限', { exact: true }).waitFor();
    if (!(await diagnostics.locator('code').first().textContent()).includes('\\u000a')) throw new Error('路径控制字符未转义');
    if (await page.evaluate(() => window.calls.length) !== calls) throw new Error('查看诊断触发额外 IPC');
    if (await diagnostics.locator('fixture').count()) throw new Error('错误文本被解释为 HTML');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('诊断详情导致窄窗口溢出');
    await diagnostics.getByRole('list', { name: '扫描诊断路径列表' }).focus();
    if (mode === 'limited') await page.screenshot({ path: 'output/playwright/reference-diagnostics.png', fullPage: true });
    await diagnostics.locator('summary').click();
  }
  await page.evaluate(() => { window.aiMode = 'pending'; });
  await start.click();
  await page.getByRole('button', { name: '停止分析' }).click();
  await result.getByText('已停止', { exact: true }).waitFor();
  if (await page.evaluate(() => window.calls.filter(c => c.cmd === 'analyze_ai_data').length) !== 6) throw new Error('停止分析触发重新提交');
  await page.evaluate(() => { window.aiMode = 'error'; });
  await start.click();
  await page.getByText('合成路径错误', { exact: true }).waitFor();
  if (await page.evaluate(() => window.calls.some(c => /prepare_cleanup|execute_cleanup/.test(c.cmd)))) throw new Error('只读流程触发清理');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('通过：显式范围、自定义路径、保护筛选、分页、键盘选择、960px、缺失／拒绝／超限／失败／取消／错误、零清理调用。全部模拟 IPC。');
}
