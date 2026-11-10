async (page) => {
  page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.calls=[];window.serial=0;window.analysisSerial=0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    const coverage={status:'complete',permissionDenied:0,excluded:0,limited:false,cancelled:false};
    const entry=(tool,name,kind,allocatedBytes)=>({tool,name,path:'/fixture/'+name,kind,basis:'元数据',impact:'本轮只读',allocatedBytes,entries:10,coverage});
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.calls.push({cmd,args});
      if(cmd.startsWith('plugin:event|'))return 1;
      if(cmd==='disk_info')return {total:100,available:50,used:50,shared:0};
      if(cmd==='cleanup_history')return [];
      if(cmd==='choose_analysis_directory'){window.serial++;return {id:'selected-directory-'+window.serial,name:'项目',path:'/fixture/project-'+window.serial,category:'目录',bytes:0,files:0,issues:0,complete:true,impact:'只读',command:null,blocked:'只读',details:[]};}
      if(cmd==='cancel_scan'){window.finish?.();return;}
      if(cmd==='analyze_developer_tools'){
        if(window.mode==='error')throw '合成：所选项目不可访问';
        if(window.mode==='pending')await new Promise(r=>window.finish=r);
        window.analysisSerial++;
        const sources=[entry('Homebrew','postgresql@14','数据库（保护）',20000),entry('Homebrew','Cellar','安装内容（保留）',10000),entry('yarn','包缓存','包缓存',window.analysisSerial*1000),entry('pnpm','依赖存储','依赖存储',500),entry('poetry','工具失败','未确认',null),entry('Rust','发布构建','发布产物（保护）',3000)];
        return {measuredAt:1700000000000+window.analysisSerial*1000,notes:['占用不等于可释放量'],entries:sources.filter(e=>args.ids.includes(e.tool.toLowerCase())).map(e=>window.mode==='pending'?{...e,allocatedBytes:null,entries:null,coverage:{...coverage,status:'pending'}}:e)};
      }
      if(cmd==='preview_homebrew_cleanup')return {measuredAt:Date.now(),executable:'/fixture/brew',output:'Would remove: <sample>',truncated:true};
      throw new Error(cmd);
    }};
  });
  await page.setViewportSize({width:1180,height:820});await page.goto('http://127.0.0.1:1420');
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'空间',exact:true}).click();
  await page.getByRole('button',{name:'开发工具',exact:true}).click();
  const scope=page.getByRole('region',{name:'开发工具空间账本'});
  const analyze=scope.getByRole('button',{name:'检查开发工具',exact:true});
  const dialog=page.getByRole('dialog',{name:'检查哪些工具？'});
  const confirm=dialog.getByRole('button',{name:'确认并检查',exact:true});
  if(!await analyze.isEnabled())throw new Error('主操作不可用');
  const rect=await analyze.boundingBox();if(!rect||rect.y+rect.height>820)throw new Error('首屏找不到主操作');
  await page.screenshot({path:'output/playwright/developer-clear-empty.png'});
  if(await page.evaluate(()=>window.calls.some(c=>/analyze_developer|preview_homebrew/.test(c.cmd))))throw new Error('自动执行探测');
  await analyze.click();await dialog.waitFor();
  await page.screenshot({path:"output/playwright/developer-clear-confirm.png"});
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='analyze_developer_tools')))throw new Error('打开范围确认即分析');
  await page.keyboard.press('Escape');
  if(await dialog.isVisible())throw new Error('Esc未关闭确认');
  if(!await analyze.evaluate(e=>e===document.activeElement))throw new Error('取消后未回到主操作');
  await analyze.click();await dialog.getByRole('checkbox',{name:'Rust 项目',exact:true}).check();
  if(await confirm.isEnabled())throw new Error('无项目范围可确认Rust');
  await dialog.getByRole('button',{name:'选择项目目录'}).click();await confirm.click();
  async function recheck(name){await scope.getByRole('button',{name:'重新检查 '+name,exact:true}).click();await confirm.click();}
  const list=scope.getByRole('navigation',{name:'已分析工具'});
  await list.getByRole('button',{name:/^Homebrew/}).waitFor();
  let names=await list.getByRole('button').allTextContents();
  if(!names[0].startsWith('Homebrew')||!names.at(-1).startsWith('Poetry'))throw new Error('最大来源或未知占用排序错误');
  const args=await page.evaluate(()=>window.calls.find(c=>c.cmd==='analyze_developer_tools').args);
  if(args.selectedId!=='selected-directory-1'||!args.ids.includes('rust'))throw new Error('未绑定项目范围');
  await list.getByRole('button',{name:/^Homebrew/}).click();
  const homebrew=scope.getByRole('region',{name:'Homebrew工具详情'});
  await homebrew.getByRole('heading',{name:'postgresql@14'}).waitFor();
  const oldTime=await homebrew.locator('.developer-scope-heading p').textContent();
  await homebrew.getByRole('button',{name:'需要保留',exact:true}).click();
  await homebrew.getByRole('group',{name:'工具来源，按观测占用排序'}).getByRole('button',{name:/^Cellar/}).click();
  await homebrew.getByRole('heading',{name:'Cellar',exact:true}).waitFor();
  await scope.getByRole('combobox',{name:'开发工具排序'}).selectOption('name');
  if((await list.getByRole('button').allTextContents())[0].startsWith('Homebrew')===false)throw new Error('名称排序错误');
  await list.getByRole('button',{name:/^Yarn/}).click();
  await recheck('Yarn');
  await scope.getByRole('article',{name:'所选来源详情'}).getByText('2 KiB',{exact:true}).waitFor();
  const latest=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='analyze_developer_tools').at(-1).args);
  if(latest.ids.join()!=='yarn'||latest.selectedId)throw new Error('单工具重查扩大范围');
  await list.getByRole('button',{name:/^Homebrew/}).click();
  if(await homebrew.locator('.developer-scope-heading p').textContent()!==oldTime)throw new Error('单工具重查覆盖其他时间');
  await list.getByRole('button',{name:/^Rust 项目/}).click();
  await scope.getByRole('button',{name:'重新检查 Rust 项目',exact:true}).click();
  await dialog.getByRole('button',{name:'选择项目目录'}).click();
  await dialog.getByRole('button',{name:'取消',exact:true}).click();
  await scope.getByText(/当前选择了其他项目/).waitFor();
  await scope.locator('.developer-project-note').getByText('/fixture/project-1',{exact:true}).waitFor();
  await recheck('Rust 项目');
  await scope.locator('.developer-project-note').getByText('/fixture/project-2',{exact:true}).waitFor();
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'空间',exact:true}).click();
  await page.getByRole('button',{name:'应用',exact:true}).click();
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'空间',exact:true}).click();
  await page.getByRole('button',{name:'开发工具',exact:true}).click();
  await scope.getByRole('heading',{name:'发布构建',exact:true}).waitFor();
  await scope.getByText('高级：Homebrew 清理建议',{exact:true}).click();
  await scope.getByRole('button',{name:'读取 Homebrew 清理预览'}).click();await scope.getByText('Would remove: <sample>',{exact:true}).waitFor();await scope.getByText(/预览已截断/).waitFor();
  await list.getByRole('button',{name:/^Homebrew/}).click();
  await page.screenshot({path:'output/playwright/developer-tools-clear.png',fullPage:true});
  await page.evaluate(()=>window.mode='error');await recheck('Homebrew');
  await scope.getByRole('alert').getByText(/已有报告保留/).waitFor();
  await homebrew.getByRole('heading',{name:'postgresql@14'}).waitFor();
  await page.evaluate(()=>window.mode='pending');await recheck('Homebrew');
  await scope.getByRole('button',{name:'停止开发工具分析'}).click();
  await homebrew.getByRole('article',{name:'所选来源详情'}).getByText('未统计',{exact:true}).waitFor();
  await page.setViewportSize({width:960,height:760});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('窄窗口横向溢出');
  if(await page.evaluate(()=>window.calls.some(c=>/execute|prepare_cleanup|scan_disk/.test(c.cmd))))throw new Error('触发写入或全局扫描');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('通过：工具／来源选择、排序、单项重查与时间保留、Rust换范围、失败保留、停止未知、切页、预览和零删除（模拟IPC）');
}
