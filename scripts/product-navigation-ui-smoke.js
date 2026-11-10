async (page) => {
  page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.calls=[];window.folderSerial=0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.calls.push({cmd,args});
      if(cmd.startsWith('plugin:event|'))return 1;
      if(cmd==='disk_info')return {total:512*1024**3,available:98*1024**3,used:414*1024**3,shared:0};
      if(cmd==='cleanup_history'||cmd==='app_uninstall_history')return [];
      if(cmd==='installed_apps')return {apps:[],coverage:{status:'complete',permissionDenied:0,excluded:0,limited:false,cancelled:false}};
      if(cmd==='choose_analysis_directory'){
        window.folderSerial++;return {id:'selected-directory-'+window.folderSerial,name:'测试项目',path:'/fixture/project-'+window.folderSerial,category:'目录',bytes:0,files:0,issues:0,complete:true,impact:'只读',command:null,blocked:'只读',details:[]};
      }
      throw new Error('未授权模拟命令：'+cmd);
    }};
  });
  for (const viewport of [{width:1180,height:820},{width:960,height:660}]) {
    await page.setViewportSize(viewport);await page.goto('http://127.0.0.1:1420');
    const nav=page.getByRole('navigation',{name:'主导航'});
    if((await nav.getByRole('button').allTextContents()).join()!=='清理,空间,应用')throw new Error('主导航不是三个任务入口');
    await page.getByRole('heading',{name:'清理',exact:true}).waitFor();
    const start=page.getByRole('button',{name:'开始检查',exact:true});
    const rect=await start.boundingBox();if(!rect||rect.y+rect.height>viewport.height)throw new Error('首屏主操作不可见');
    if(await page.locator('.button.primary:visible').count()!==1)throw new Error('清理首屏有多个主操作');
    if(await page.locator('.metric-card:visible').count())throw new Error('检查前显示空清理指标');
    if(await page.getByRole('region',{name:'独立文件夹分析'}).count())throw new Error('文件夹配置仍占据清理首页');
    await page.waitForTimeout(650);
    await page.screenshot({path:`output/playwright/product-clean-home-${viewport.width}x${viewport.height}.png`});
    await start.click();
    const scope=page.getByRole('dialog');
    await scope.waitFor();
    const scopeRect=await scope.boundingBox();
    if(!scopeRect||scopeRect.x<0||scopeRect.y<0||scopeRect.x+scopeRect.width>viewport.width+1||scopeRect.y+scopeRect.height>viewport.height+1)throw new Error('范围确认框超出窗口');
    await page.screenshot({path:`output/playwright/product-scan-scope-${viewport.width}x${viewport.height}.png`});
    await page.keyboard.press('Escape');
    await page.waitForFunction(el=>el===document.activeElement,await start.elementHandle());
    await start.click();
    await scope.getByRole('button',{name:'取消',exact:true}).click();
    await page.waitForFunction(el=>el===document.activeElement,await start.elementHandle());
    await nav.getByRole('button',{name:'空间',exact:true}).focus();await page.keyboard.press('Enter');
    const categories=page.getByRole('navigation',{name:'空间分类'});
    if((await categories.getByRole('button').allTextContents()).join()!=='文件夹,开发工具,项目空间,AI 数据')throw new Error('空间分类不完整');
    for(const name of ['开发工具','项目空间','AI 数据','文件夹']){await categories.getByRole('button',{name,exact:true}).click();}
    if(await page.evaluate(()=>window.calls.some(c=>/scan_disk|scan_projects|analyze_|inspect_app|preview_homebrew/.test(c.cmd))))throw new Error('切页自动分析');
    const folder=page.getByRole('region',{name:'独立文件夹分析'});
    await folder.getByRole('button',{name:'选择文件夹',exact:true}).click();
    const analyze=folder.getByRole('button',{name:'分析所选目录',exact:true});
    if(await analyze.isEnabled())throw new Error('选择后未确认即可分析');
    await categories.getByRole('button',{name:'开发工具',exact:true}).click();
    await page.getByRole('button',{name:'检查开发工具',exact:true}).click();
    await page.keyboard.press('Escape');
    await categories.getByRole('button',{name:'文件夹',exact:true}).click();
    await folder.getByText('/fixture/project-1',{exact:true}).waitFor();
    await page.screenshot({path:`output/playwright/product-space-home-${viewport.width}x${viewport.height}.png`});
    await nav.getByRole('button',{name:'应用',exact:true}).click();
    await page.getByRole('heading',{name:'应用',exact:true,level:1}).waitFor();
    await page.getByRole('button',{name:/^清理记录/}).click();
    await page.getByRole('heading',{name:'清理记录',exact:true}).waitFor();
    await nav.getByRole('button',{name:'清理',exact:true}).click();
    await page.getByRole('button',{name:'查看空间占用',exact:true}).click();
    await folder.getByText('/fixture/project-1',{exact:true}).waitFor();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('窄窗口横向溢出');
    if(await page.evaluate(()=>window.calls.some(c=>/execute|prepare_cleanup|scan_disk|analyze_developer/.test(c.cmd))))throw new Error('导航触发处理或扫描');
  }
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('通过：三主入口、空间分类、历史次级入口、唯一主操作、目录范围保留、键盘导航、1180×820／960×660及零自动探测（模拟IPC）');
}
