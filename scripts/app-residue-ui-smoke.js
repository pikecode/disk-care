async (page) => {
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true; window.calls = []; window.mode = 'complete';
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = { transformCallback() { return 1; }, async invoke(cmd, args) {
      window.calls.push({cmd,args});
      if (cmd.startsWith('plugin:event|')) return 1;
      if (cmd === 'disk_info') return {total:100,available:50,used:50,shared:0};
      if (cmd === 'cleanup_history') return [];
      if (cmd === 'cancel_scan') { window.finish?.(); return; }
      if (cmd === 'reveal_residue_candidate') throw '合成：候选身份已变化';
      if (cmd === 'inspect_app_residue') {
        if (window.mode === 'pending') await new Promise(resolve => { window.finish = resolve; });
        const status = window.mode === 'pending' ? 'cancelled' : window.mode;
        return {id:1,measuredAt:Date.now(),sources:[{name:'配置与可能的凭据',path:'/fixture/.cc-switch',coverage:{status,permissionDenied:status==='denied'?1:0,excluded:0,limited:status==='limited',cancelled:status==='cancelled',diagnostics:[]},candidates:status==='complete'?[{id:1,path:'/fixture/.cc-switch',category:'配置',evidence:'历史样例，可能含凭据',allocatedBytes:4096,logicalBytes:100,cleanupEligible:false}]:[]}]};
      }
      throw new Error(cmd);
    }};
  });
  await page.setViewportSize({width:960,height:760});
  await page.goto('http://127.0.0.1:1420');
  await page.getByRole('button',{name:'应用残留检查',exact:true}).click();
  const start=page.getByRole('button',{name:'开始只读残留检查'});
  if(await start.isEnabled()) throw new Error('范围未确认即可检查');
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='inspect_app_residue'))) throw new Error('进入自动检查');
  await page.getByRole('checkbox',{name:'我已了解三个检查来源与敏感范围'}).check();
  await start.click();
  await page.getByRole('heading',{name:/范围内检查完成/}).waitFor();
  await page.locator('.ai-item summary').click();
  await page.getByRole('button',{name:'在 Finder 中定位候选'}).click();
  await page.getByRole('alert').getByText('合成：候选身份已变化').waitFor();
  for(const mode of ['absent','denied','limited','failed']) {
    await page.evaluate(m=>{window.mode=m;},mode); await start.click();
    await page.getByText('没有候选可展示，请先查看覆盖状态；不代表没有残留。',{exact:true}).waitFor();
  }
  await page.evaluate(()=>{window.mode='pending';}); await start.click();
  await page.getByRole('button',{name:'停止残留检查'}).click();
  await page.getByRole('heading',{name:/已停止/}).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('窄窗口溢出');
  if(await page.evaluate(()=>window.calls.some(c=>/execute_cleanup|prepare_cleanup|mount|kill/.test(c.cmd)))) throw new Error('只读流程触发写入');
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('通过：范围确认、三来源状态、候选复核失败、取消、960px与零删除调用（模拟IPC）');
}
