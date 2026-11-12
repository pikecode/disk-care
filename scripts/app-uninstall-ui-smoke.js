async (page) => {
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true; window.calls = []; window.uninstallMode = 'ok';
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = { transformCallback() { return 1; }, async invoke(cmd,args) {
      window.calls.push({cmd,args});
      if (cmd.startsWith('plugin:event|')) return 1;
      if (cmd === 'disk_info') return {total:100,available:50,used:50,shared:0};
      if (cmd === 'app_icon') return null;
      if (cmd === 'cleanup_history') return [];
      if (cmd === 'app_uninstall_history') return [...(window.savedUninstall ? [window.savedUninstall] : []),{at:1,name:'历史样例',path:'/Applications/History.app',bundleId:'org.fixture.history',success:true,message:'应用包已移到废纸篓'}];
      if (cmd === 'installed_apps') return {apps:[{path:'/Applications/Test.app',name:'测试应用',bundleId:'org.fixture.app'},{path:'/Applications/System.app',name:'受保护样例',bundleId:'com.apple.fixture'}],coverage:{status:'complete',permissionDenied:0,excluded:0,limited:false,cancelled:false}};
      if(cmd === 'prepare_app_exit') {
        if(window.exitMode==='unavailable') throw '无法安全确认组件身份，请手动退出';
        return {token:91,name:'测试应用',path:args.path,bundleId:args.bundleId,expiresAt:window.exitMode==='expired'?Date.now()-1:Date.now()+60000,allowForce:false,processes:[{pid:12345,name:'测试后台组件',executable:args.path+'/Contents/MacOS/helper'}]};
      }
      if(cmd === 'execute_app_exit') {
        if(window.exitMode==='changed') throw '运行组件身份已变化，请重新检查';
        if(!args.force && window.exitMode!=='normal-success') return {remaining:{token:92,name:'测试应用',path:'/Applications/Test.app',bundleId:'org.fixture.app',expiresAt:Date.now()+60000,allowForce:true,processes:[{pid:12345,name:'测试后台组件',executable:'/Applications/Test.app/Contents/MacOS/helper'}]}};
        window.uninstallMode='ok';return {remaining:null};
      }
      if (cmd === 'prepare_app_uninstall') {
        if(window.uninstallMode === 'running') throw {code:'occupied',message:'应用正在运行，请正常退出'};
        return {token:42,name:'测试应用',path:args.path,bundleId:args.bundleId,expiresAt:window.uninstallMode === 'local-expired' ? Date.now()-1 : Date.now()+(window.uninstallMode === 'soon-expired' ? 1500 : 60000),before:window.beforeObservation ?? null};
      }
      if (cmd === 'execute_app_uninstall') {
        if(window.uninstallMode === 'expired') throw '卸载预览已失效，请重新预览并确认';
        if(window.uninstallMode === 'failed') throw '合成：应用身份已变化，请重新预览';
        await new Promise(resolve=>{window.finishUninstall=resolve;});
        const outcome={name:'测试应用',path:'/Applications/Test.app',bundleId:'org.fixture.app',trashPath:'/fixture/.Trash/Test.app',at:Date.now(),before:window.beforeObservation};
        window.savedUninstall={...outcome,success:true,message:'应用包已移到废纸篓'}; return outcome;
      }
      if(cmd === 'inspect_app_residue') {
        const names=['应用缓存','应用数据','偏好设置','应用日志','保存状态'];
        const sources=names.map((name,i)=>{const status=args.appPath ? (i===2?'absent':'complete') : (i===1||i===2?'absent':i===3?'denied':'complete'); return {name,path:`/fixture/ledger-${i}`,impact:'默认保护，归属未知',coverage:{status,permissionDenied:status==='denied'?1:0,excluded:0,limited:false,cancelled:false},candidates:status==='complete'?[{id:i+1,path:`/fixture/ledger-${i}`,category:name,evidence:'精确路径',allocatedBytes:4096,logicalBytes:100,cleanupEligible:false}]:[]};});
        const measuredAt=Date.now();
        if(args.appPath) window.beforeObservation={ruleVersion:2,measuredAt,sources:sources.map(s=>({name:s.name,path:s.path,status:s.coverage.status,present:s.candidates.length>0,allocatedBytes:s.coverage.status==='complete'?4096:null}))};
        return {id:1,target:args.bundleId,ruleVersion:2,targetAppPath:args.appPath??null,measuredAt,sources};
      }
      throw new Error(cmd);
    }};
  });
  await page.setViewportSize({width:960,height:760});
  await page.goto('http://127.0.0.1:1420');
  await page.getByRole('button',{name:'应用',exact:true}).click();
  await page.getByRole('button',{name:'读取应用列表',exact:true}).click();
  if(await page.getByRole('button',{name:'卸载 受保护样例',exact:true}).isEnabled()) throw new Error('受保护应用仍可发起卸载');
  await page.getByRole('button',{name:'查看 测试应用',exact:true}).click();
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='prepare_app_uninstall'||c.cmd==='execute_app_uninstall'))) throw new Error('选择应用触发卸载');
  await page.getByRole('textbox',{name:'搜索应用'}).fill('测试');
  await page.getByRole('button',{name:'清理',exact:true}).click();
  await page.getByRole('button',{name:'应用',exact:true}).click();
  if(await page.getByRole('textbox',{name:'搜索应用'}).inputValue()!=='测试') throw new Error('切页丢失搜索');
  await page.getByText('卸载记录 · 1',{exact:true}).click();
  await page.getByText('历史样例 · 已移到废纸篓',{exact:true}).waitFor();
  await page.getByRole('button',{name:'检查关联文件',exact:true}).click();
  await page.locator('summary').filter({hasText:'报告目标：org.fixture.app'}).waitFor();
  const entry = page.getByRole('button',{name:'卸载此应用…',exact:true});
  await page.evaluate(()=>{window.uninstallMode='running';});
  await page.getByRole('button',{name:'卸载 测试应用',exact:true}).click();
  await page.getByRole('alert').getByText('应用正在运行，请正常退出',{exact:false}).waitFor();
  const exitEntry=page.getByRole('button',{name:'退出应用后继续…',exact:true});
  const exitDialog=page.getByRole('dialog',{name:'退出应用后继续卸载',exact:true});
  await exitEntry.click();
  await exitDialog.getByText('测试后台组件',{exact:true}).waitFor();
  if(!await exitDialog.getByRole('button',{name:'取消',exact:true}).evaluate(el=>el===document.activeElement)) throw new Error('退出窗口默认焦点非取消');
  if(await exitDialog.getByRole('button',{name:'强制退出并继续'}).count()) throw new Error('未正常退出就显示强制');
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='execute_app_exit'))) throw new Error('打开窗口自动退出');
  await page.keyboard.press('Escape');
  await page.waitForFunction(el=>document.activeElement===el,await exitEntry.elementHandle());
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='execute_app_exit'))) throw new Error('取消执行退出');
  await exitEntry.click();await exitDialog.getByRole('button',{name:'正常退出并继续',exact:true}).click();
  const forceExit=exitDialog.getByRole('button',{name:'强制退出并继续',exact:true});
  await forceExit.waitFor();
  if(await forceExit.isEnabled()) throw new Error('未勾选风险即可强制');
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='execute_app_exit'&&c.args.force))) throw new Error('正常超时自动强制');
  await page.setViewportSize({width:960,height:660});
  const exitBounds=await exitDialog.boundingBox();if(!exitBounds||exitBounds.y<0||exitBounds.y+exitBounds.height>660) throw new Error('退出对话框超出最低窗口');
  await page.screenshot({path:'output/playwright/app-exit-confirm.png'});
  await exitDialog.getByRole('checkbox',{name:'我了解强制退出可能丢失未保存内容',exact:true}).check();
  await forceExit.click();
  await page.getByRole('dialog',{name:'卸载 测试应用？'}).waitFor();
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='execute_app_uninstall'))) throw new Error('退出后自动卸载');
  if(await page.getByRole('button',{name:'确认移到废纸篓',exact:true}).isEnabled()) throw new Error('退出确认复用于卸载');
  const forceCall=await page.evaluate(()=>window.calls.find(c=>c.cmd==='execute_app_exit'&&c.args.force));
  if(forceCall.args.token!==92) throw new Error('强制退出未使用刷新令牌');
  await page.getByRole('button',{name:'取消卸载',exact:true}).click();
  for(const mode of ['expired','unavailable','changed','normal-success']) {
    await page.evaluate(m=>{window.uninstallMode='running';window.exitMode=m;},mode);
    await entry.click();await exitEntry.click();
    if(mode==='expired') {await exitDialog.getByText('退出预览已过期，请重新检查运行组件。',{exact:true}).waitFor();if(await exitDialog.getByRole('button',{name:'正常退出并继续'}).count()) throw new Error('过期仍有退出入口');}
    else if(mode==='unavailable') await exitDialog.getByRole('alert').getByText('无法安全确认组件身份，请手动退出',{exact:true}).waitFor();
    else {await exitDialog.getByRole('button',{name:'正常退出并继续',exact:true}).click();if(mode==='changed') await exitDialog.getByRole('alert').getByText('运行组件身份已变化，请重新检查',{exact:true}).waitFor();}
    if(mode==='normal-success') {await page.getByRole('dialog',{name:'卸载 测试应用？'}).waitFor();await page.getByRole('button',{name:'取消卸载',exact:true}).click();}
    else await exitDialog.getByRole('button',{name:'取消',exact:true}).click();
  }
  await page.setViewportSize({width:960,height:760});
  await page.evaluate(()=>{window.exitMode='pending';window.uninstallMode='running';});
  await entry.click();
  await page.evaluate(()=>{window.uninstallMode='ok';});
  await page.getByRole('button',{name:'重新检查并预览',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'卸载 测试应用？'});
  await dialog.waitFor();
  await dialog.getByText('仅所选应用本体',{exact:true}).waitFor();
  await dialog.getByText('缓存、设置与个人资料',{exact:true}).waitFor();
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='execute_app_uninstall'))) throw new Error('行操作或重试绕过确认');
  const confirm = dialog.getByRole('button',{name:'确认移到废纸篓',exact:true});
  if(await confirm.isEnabled()) throw new Error('未确认可执行卸载');
  if(!await dialog.getByRole('button',{name:'取消卸载'}).evaluate(el=>el===document.activeElement)) throw new Error('默认焦点不是取消');
  await dialog.getByRole('button',{name:'取消卸载'}).click();
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='execute_app_uninstall'))) throw new Error('取消触发执行');
  await entry.click(); await page.keyboard.press('Escape');
  if(await dialog.isVisible()) throw new Error('Esc 未取消');
  await entry.click();
  await dialog.getByRole('checkbox',{name:'我确认将这个应用移到废纸篓'}).check();
  await page.screenshot({path:'output/playwright/app-uninstall-confirm.png',fullPage:true});
  await page.evaluate(()=>{window.uninstallMode='failed';});
  const historyBeforeFailure=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='app_uninstall_history').length);
  await confirm.click();
  await page.getByRole('alert').getByText(/应用身份已变化/).waitFor();
  if(await dialog.isVisible()) throw new Error('失败后保留可重放的预览');
  await page.waitForFunction(before=>window.calls.filter(c=>c.cmd==='app_uninstall_history').length>before,historyBeforeFailure);
  await page.evaluate(()=>{window.uninstallMode='local-expired';});
  const beforeExpired=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='execute_app_uninstall').length);
  await entry.click();
  await dialog.getByText('预览已过期，请重新预览并确认。',{exact:true}).waitFor();
  if(await confirm.isEnabled()) throw new Error('过期预览仍可执行');
  await page.evaluate(()=>{window.uninstallMode='ok';});
  await dialog.getByRole('button',{name:'重新预览卸载'}).click();
  await dialog.getByText(/预览剩余/).waitFor();
  if(await confirm.isEnabled()) throw new Error('重新预览沿用确认');
  if(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='execute_app_uninstall').length)!==beforeExpired) throw new Error('过期或重新预览触发执行');
  await dialog.getByRole('button',{name:'取消卸载'}).click();
  await page.evaluate(()=>{window.uninstallMode='soon-expired';});
  await entry.click(); await dialog.getByRole('checkbox',{name:'我确认将这个应用移到废纸篓'}).check();
  await dialog.getByText('预览已过期，请重新预览并确认。',{exact:true}).waitFor();
  if(await confirm.isEnabled()) throw new Error('等待过期后仍可执行');
  await dialog.getByRole('button',{name:'取消卸载'}).click();
  await page.evaluate(()=>{window.uninstallMode='expired';});
  await entry.click();
  await dialog.getByRole('checkbox',{name:'我确认将这个应用移到废纸篓'}).check(); await confirm.click();
  await page.getByRole('alert').getByText(/卸载预览已失效/).waitFor();
  await page.evaluate(()=>{window.uninstallMode='ok';});
  await entry.click();
  if(await confirm.isEnabled()) throw new Error('重试沿用旧确认');
  await dialog.getByRole('checkbox',{name:'我确认将这个应用移到废纸篓'}).check();
  await confirm.click();
  await dialog.getByRole('button',{name:'正在移到废纸篓…'}).waitFor();
  await page.keyboard.press('Escape');
  if(!await dialog.isVisible()) throw new Error('执行中允许关闭确认');
  if(await dialog.getByRole('button',{name:'取消卸载'}).isEnabled()) throw new Error('执行中允许取消系统移动');
  await page.evaluate(()=>window.finishUninstall());
  await page.getByRole('status').getByText('测试应用 已移到废纸篓',{exact:true}).waitFor();
  if(await page.getByRole('button',{name:'查看 测试应用',exact:true}).count()) throw new Error('卸载后未更新列表');
  if(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='inspect_app_residue').length)!==1) throw new Error('卸载后自动扫描');
  await page.getByText('如何恢复应用？',{exact:true}).click();
  await page.getByText('移入位置：/fixture/.Trash/Test.app',{exact:true}).waitFor();
  await page.getByRole('button',{name:'检查该应用的关联文件'}).click();
  await page.getByRole('checkbox',{name:'我已了解检查来源与敏感范围'}).check();
  await page.getByRole('button',{name:'检查关联文件',exact:true}).click();
  await page.locator('summary').filter({hasText:'报告目标：org.fixture.app'}).waitFor();
  await page.getByRole('region',{name:'卸载前后观测'}).getByText(/应用缓存 · 仍存在关联项/).waitFor();
  await page.getByRole('region',{name:'卸载前后观测'}).getByText(/应用数据 · 本次未发现/).waitFor();
  await page.getByRole('region',{name:'卸载前后观测'}).getByText(/应用日志 · 无法判断/).waitFor();
  await page.screenshot({path:'output/playwright/app-ledger-comparison.png',fullPage:true});
  const args=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='inspect_app_residue').at(-1).args);
  if(args.appPath || args.bundleId!=='org.fixture.app') throw new Error('卸载后应使用标识而非已移除路径');
  if(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='execute_app_uninstall').some(c=>Object.keys(c.args).join(',')!=='token'))) throw new Error('执行传入任意路径');
  if(await page.evaluate(()=>window.calls.some(c=>/execute_cleanup|prepare_cleanup/.test(c.cmd)))) throw new Error('卸载触发通用清理');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('960px 横向溢出');
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('通过：卸载预览、取消、Esc、默认焦点、确认、失败重试、执行保护、列表刷新与显式关联检查（模拟）');
}
