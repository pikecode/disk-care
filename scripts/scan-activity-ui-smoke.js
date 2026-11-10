async (page) => {
  page.setDefaultTimeout(8000);
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.calls=[];window.scanMode='returned';window.savedActivity=[];
    const disk={total:10000000,available:5000000,used:5000000,shared:0};
    const item={id:'uv',name:'uv 缓存',category:'开发缓存',path:'/fixture/cache',bytes:1024,files:1,issues:0,complete:true,command:'uv cache clean',impact:'重建缓存',blocked:null,details:[]};
    const record={at:1,estimated:1024,released:0,beforeAvailable:5000000,afterAvailable:5000000,diskVerified:true,warning:null,outcomes:[{name:'uv 缓存',success:true,status:'success',message:'合成结果'}]};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.calls.push({cmd,args});
      if(cmd.startsWith('plugin:event|'))return 1;
      if(cmd==='disk_info')return disk;
      if(cmd==='cleanup_history')return [record];
      if(cmd==='scan_activity'){
        if(window.scanMode==='activity-error')throw '合成：活动记录损坏，原文件已保留';
        return {sessionId:'current-session',appVersion:'test-version',records:window.savedActivity};
      }
      if(cmd==='scan_disk'){
        const entry={id:`request-${window.savedActivity.length}`,sessionId:'current-session',appVersion:'test-version',receivedAt:Date.now(),finishedAt:null,durationMs:null,origin:args.origin??'unknown',extended:args.extended,requestedRoots:args.rootIds?.length??null,status:'received'};
        window.savedActivity.unshift(entry);
        if(window.scanMode==='failed'){entry.status='failed';entry.finishedAt=Date.now();throw '合成：扫描失败';}
        const finish=(cancelled=false)=>{entry.status=cancelled?'cancelled':'returned';entry.finishedAt=Date.now();entry.durationMs=1;return {id:Date.now(),disk,items:[item],roots:[],extended:args.extended,durationMs:1,cancelled,activity:entry,activityWarning:window.scanMode==='warning'?'扫描来源未能持久保存，本次操作记录可能缺失':null};};
        if(window.scanMode==='waiting')return new Promise(resolve=>{window.cancelWaiting=()=>resolve(finish(true));});
        return finish();
      }
      if(cmd==='cancel_scan'){window.cancelWaiting?.();return;}
      if(cmd==='prepare_cleanup')return {token:42,createdAt:Date.now(),estimated:1024,items:[item]};
      if(cmd==='execute_cleanup')return {...record,at:Date.now()};
      throw new Error(`未预期IPC：${cmd}`);
    }};
  });
  await page.setViewportSize({width:960,height:660});await page.goto('http://127.0.0.1:1420');
  const scanCalls=()=>page.evaluate(()=>window.calls.filter(c=>c.cmd==='scan_disk'));
  const start=page.getByRole('button',{name:/^(开始检查|重新检查)$/,exact:true}).first();
  const panel=page.locator('details.scan-activity');
  const read=panel.getByRole('button',{name:'读取扫描活动',exact:true});
  async function readActivity(){if(!await panel.evaluate(el=>el.open))await panel.locator('summary').first().click();await read.click();}
  if((await scanCalls()).length)throw new Error('冷启动自动扫描');
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='scan_activity')))throw new Error('启动自动读取活动');
  await page.getByRole('button',{name:'空间',exact:true}).click();
  await page.getByRole('button',{name:'清理',exact:true}).click();
  await start.click();await page.keyboard.press('Escape');
  if((await scanCalls()).length)throw new Error('切页或取消触发扫描');
  await panel.locator('summary').first().click();await readActivity();
  await panel.getByText('没有保存的扫描请求；这不证明过去没有扫描。',{exact:true}).waitFor();
  async function confirmScope(){
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    await dialog.getByRole('button',{name:'开始常规扫描',exact:true}).click();
  }
  await start.click();await confirmScope();
  await page.getByText(/本次请求入口：清理页/).waitFor();
  if((await scanCalls()).at(-1).args.origin!=='cleanup')throw new Error('清理页入口未绑定');
  await readActivity();await panel.getByText('清理页 · 常规扫描 · 结果已返回',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'选择uv 缓存',exact:true}).check();
  await page.getByRole('button',{name:/预览清理计划/}).click();
  const cleanup=page.getByRole('dialog',{name:'确认这次清理'});
  await cleanup.getByRole('checkbox').check();await cleanup.getByRole('button',{name:'确认清理',exact:true}).click();
  const result=page.getByRole('region',{name:'本次清理结果',exact:true});
  await result.getByRole('button',{name:'重新检查',exact:true}).click();await confirmScope();
  await page.getByText(/本次请求入口：清理结果重新检查/).waitFor();
  if((await scanCalls()).at(-1).args.origin!=='result')throw new Error('结果重新检查入口未绑定');
  await page.getByRole('button',{name:/^清理记录/}).click();
  await page.getByRole('region',{name:'历史清理结果'}).getByRole('button',{name:'重新检查当前空间'}).click();
  await confirmScope();await page.getByText(/本次请求入口：清理记录重新检查/).waitFor();
  if((await scanCalls()).at(-1).args.origin!=='history')throw new Error('历史重新检查入口未绑定');
  await page.evaluate(()=>{window.scanMode='waiting';});
  await start.click();await confirmScope();await page.getByRole('button',{name:'停止扫描',exact:true}).click();
  await page.getByText(/本次请求入口：清理页/).waitFor();
  await readActivity();await panel.getByText('清理页 · 常规扫描 · 已停止',{exact:true}).waitFor();
  await page.evaluate(()=>{window.scanMode='warning';});
  await start.click();await confirmScope();
  await page.getByRole('alert').getByText(/扫描来源未能持久保存/).waitFor();
  await page.evaluate(()=>{window.scanMode='failed';});
  await start.click();await confirmScope();
  await page.getByRole('alert').getByText(/合成：扫描失败/).waitFor();
  await readActivity();await panel.getByText('清理页 · 常规扫描 · 请求未完成',{exact:true}).waitFor();
  await page.evaluate(()=>{window.scanMode='activity-error';});await readActivity();
  await panel.getByRole('alert').getByText(/记录损坏/).waitFor();
  if((await scanCalls()).length!==6)throw new Error('活动查询或重读隐式扫描');
  await page.screenshot({path:'output/playwright/scan-activity-960x660.png',fullPage:true});
  await page.reload();
  if((await scanCalls()).length)throw new Error('重新载入自动扫描');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('最低窗口横向溢出');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('通过：冷启动／切页／取消零扫描、三入口、停止／失败、保存警告、按需活动读取、无隐式重试、最低窗口（模拟IPC）');
}
