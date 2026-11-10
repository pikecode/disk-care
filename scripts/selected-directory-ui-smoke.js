async (page) => {
  page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.calls=[];window.folderMode='cancel';
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    const item=(id,name,path,category='目录')=>({id,name,path,category,bytes:8192,files:1,issues:0,complete:true,impact:'只读',command:null,blocked:'只读',details:[]});
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.calls.push({cmd,args});
      if(cmd.startsWith('plugin:event|'))return 1;
      if(cmd==='disk_info')return {total:100,available:50,used:50,shared:0};
      if(cmd==='cleanup_history')return [];
      if(cmd==='choose_analysis_directory'){
        if(window.folderMode==='cancel')return null;
        window.folderSerial=(window.folderSerial??0)+1;
        return item(`selected-directory-${window.folderSerial}`,'选定目录',`/fixture/folder-${window.folderSerial}`,'主要目录');
      }
      if(cmd==='cancel_scan'){window.finishFolder?.();return;}
      if(cmd==='list_children'){
        if(window.folderMode==='denied')throw '合成：所选目录不可访问，请重新选择';
        if(window.folderMode==='pending')await new Promise(resolve=>{window.finishFolder=resolve;});
        const root=`/fixture/folder-${window.folderSerial}`;
        const children=args.relative?[]:[item('child','子目录',root+'/child'),{...item('large.bin','large.bin',root+'/large.bin','文件'),bytes:4096}];
        return {items:children,total:children.length,nextOffset:null,measuredAt:100,complete:window.folderMode!=='pending',issues:0,coverage:{status:window.folderMode==='pending'?'cancelled':'complete',permissionDenied:0,excluded:0,limited:false,cancelled:window.folderMode==='pending'},mapItems:children,otherBytes:0,otherCount:0,largeFilesTotal:args.relative?0:1,largeFiles:args.relative?[]:[{path:root+'/large.bin',relative:'large.bin',logicalBytes:2097152,allocatedBytes:4096,modifiedAt:null}]};
      }
      if(cmd==='reveal_observed_file')return;
      throw new Error(cmd);
    }};
  });
  await page.setViewportSize({width:960,height:760});await page.goto('http://127.0.0.1:1420');
  if(await page.getByRole('group',{name:'按类型筛选'}).count())throw new Error('未扫描仍展示空筛选器');
  if(await page.getByRole('region',{name:'独立空间账本'}).count())throw new Error('未分析仍堆叠空账本');
  await page.screenshot({path:'output/playwright/overview-clear.png'});
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'空间',exact:true}).click();
  const scope=page.getByRole('region',{name:'独立文件夹分析'});
  await scope.getByRole('button',{name:'选择文件夹',exact:true}).click();
  if(await scope.getByRole('button',{name:'分析所选目录'}).count())throw new Error('取消选择却建立范围');
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='list_children')))throw new Error('选择取消触发扫描');
  await page.evaluate(()=>{window.folderMode='ok';});
  await scope.getByRole('button',{name:'选择文件夹',exact:true}).click();
  const start=scope.getByRole('button',{name:'分析所选目录'});
  if(await start.isEnabled())throw new Error('未确认即可分析');
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='list_children')))throw new Error('选择后自动分析');
  await scope.getByRole('checkbox',{name:'我已确认此目录的只读分析范围'}).check();await start.click();
  const dialog=page.getByRole('dialog',{name:'选定目录'});await dialog.waitFor();
  await dialog.locator('.browse-list').getByRole('button',{name:/子目录/}).waitFor();
  const tabs=dialog.getByRole('group',{name:'目录视图'});
  await tabs.getByRole('button',{name:'空间地图',exact:true}).click();
  await dialog.getByRole('button',{name:/^子目录，/}).click();
  await dialog.getByRole('button',{name:'打开文件夹',exact:true}).click();
  await dialog.getByRole('navigation',{name:'目录层级'}).getByRole('button',{name:'起始目录'}).click();
  await tabs.getByRole('button',{name:'大文件',exact:true}).click();
  await dialog.getByRole('combobox',{name:'最小逻辑大小'}).selectOption('1048576');
  await dialog.getByRole('button',{name:'在 Finder 中定位',exact:true}).click();
  const reveal=await page.evaluate(()=>window.calls.find(c=>c.cmd==='reveal_observed_file').args);
  if(reveal.id!=='selected-directory-1'||reveal.relative!=='large.bin'||reveal.measuredAt!==100)throw new Error('定位未绑定所选目录与观测');
  await page.screenshot({path:'output/playwright/selected-directory-files.png',fullPage:true});
  await dialog.getByRole('button',{name:'关闭目录浏览'}).click();
  await scope.getByRole('button',{name:'选择文件夹',exact:true}).click();
  if(await start.isEnabled())throw new Error('重新选择未重置确认');
  await page.evaluate(()=>{window.folderMode='denied';});
  await scope.getByRole('checkbox',{name:'我已确认此目录的只读分析范围'}).check();await start.click();
  await page.getByRole('alert').getByText(/所选目录不可访问/).waitFor();
  if(await dialog.isVisible())throw new Error('失败被显示为空目录');
  await page.evaluate(()=>{window.folderMode='pending';});await start.click();
  await dialog.getByRole('button',{name:'停止统计',exact:true}).click();
  await dialog.locator('.warning-text').filter({hasText:/统计不完整/}).first().waitFor();
  await dialog.getByRole('button',{name:'关闭目录浏览'}).click();
  if(await page.evaluate(()=>window.calls.some(c=>/scan_disk|prepare_cleanup|execute_cleanup|execute_app_uninstall/.test(c.cmd))))throw new Error('独立目录触发全局扫描或写入');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('窄窗口横向溢出');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('通过：独立目录选择／取消／确认、地图下钻、大文件定位、拒绝、停止与零删除（模拟IPC）');
}
