async (page) => {
  page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.calls=[];window.projectVariant='old';window.serial=0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    const coverage={status:'complete',permissionDenied:0,excluded:0,limited:false,cancelled:false};
    const entry=(id,name,category)=>({id,name,category,path:'/fixture/'+id,bytes:4096,files:1,complete:true,issues:0,command:null,blocked:'只读',impact:'保留',details:[]});
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.calls.push({cmd,args});if(cmd.startsWith('plugin:event|'))return 1;
      if(cmd==='disk_info')return {total:100,used:50,available:50,shared:0};
      if(cmd==='cleanup_history')return [];
      if(cmd==='choose_analysis_directory')return entry('selected-directory-1','测试目录','目录');
      if(cmd==='list_children'){
        const items=args.relative?[]:[entry('child','子目录','目录'),entry('plain.txt','普通文件','文件')];
        return {items,total:items.length,nextOffset:null,measuredAt:100,complete:true,issues:0,coverage,mapItems:items,otherBytes:0,otherCount:0,largeFiles:[],largeFilesTotal:0};
      }
      if(cmd==='scan_projects')return {root:args.root,measuredAt:Date.now()+window.serial++,durationMs:1,complete:true,cancelled:false,issues:0,warnings:[],baselineAt:null,changes:[],projects:(window.projectVariant==='old'?['项目甲','项目乙']:['新项目']).map((name,i)=>({name,path:name,languages:i?['Rust']:['Node'],artifacts:[{name:'target',bytes:4096,files:1,complete:true,recovery:'需要重新构建'}],evidence:[{kind:'unknown',message:'未发现引用不代表无人使用'}]}))};
      throw new Error(cmd);
    }};
  });
  await page.setViewportSize({width:1180,height:820});await page.goto('http://127.0.0.1:1420');
  const nav=page.getByRole('navigation',{name:'主导航'});await nav.getByRole('button',{name:'空间',exact:true}).click();
  await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await page.getByRole('checkbox',{name:'我已确认此目录的只读分析范围'}).check();await page.getByRole('button',{name:'分析所选目录',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'测试目录'});const detail=dialog.getByRole('region',{name:'目录对象详情'});
  await dialog.getByRole('button',{name:'选择文件夹 子目录',exact:true}).waitFor();const before=await page.evaluate(()=>window.calls.length);
  await dialog.getByRole('button',{name:'选择文件 普通文件',exact:true}).focus();await page.keyboard.press('Enter');await detail.getByRole('heading',{name:'普通文件',exact:true}).waitFor();
  if(await detail.getByRole('button',{name:'打开文件夹'}).count())throw new Error('普通文件被当目录打开');
  await dialog.getByRole('button',{name:'选择文件夹 子目录',exact:true}).click();await detail.getByRole('heading',{name:'子目录',exact:true}).waitFor();
  if(await page.evaluate(()=>window.calls.length)!==before)throw new Error('目录选择触发读盘');
  await dialog.getByRole('button',{name:'空间地图',exact:true}).click();await detail.getByRole('heading',{name:'子目录',exact:true}).waitFor();
  await detail.scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  await page.screenshot({path:'output/playwright/e3b-directory-detail.png',fullPage:true});
  await detail.getByRole('button',{name:'打开文件夹',exact:true}).click();await dialog.getByRole('navigation',{name:'目录层级'}).getByText('child',{exact:true}).waitFor();
  const requests=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='list_children'));if(requests.length!==2||requests[1].args.relative!=='child')throw new Error('明确打开未绑定目标或调用次数不正确');
  await dialog.getByRole('button',{name:'起始目录',exact:true}).click();await dialog.getByRole('button',{name:'列表',exact:true}).click();
  await detail.getByRole('heading',{name:'子目录',exact:true}).waitFor();await dialog.getByRole('button',{name:'关闭目录浏览'}).click();
  await page.getByRole('navigation',{name:'空间分类'}).getByRole('button',{name:'项目空间',exact:true}).click();
  async function scan(){await page.getByRole('button',{name:'扫描项目',exact:true}).click();const scope=page.getByRole('dialog');await scope.getByRole('checkbox',{name:'我已了解范围与权限要求，继续扫描'}).check();await scope.getByRole('button',{name:'开始项目扫描',exact:true}).click();}
  await scan();const project=page.getByRole('article',{name:'项目对象详情'});await project.getByRole('heading',{name:'项目甲',exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.calls.length);await page.getByRole('button',{name:'选择项目 项目乙',exact:true}).focus();await page.keyboard.press('Enter');await project.getByRole('heading',{name:'项目乙',exact:true}).waitFor();
  if(await page.evaluate(()=>window.calls.length)!==calls)throw new Error('项目选择触发额外分析');
  await page.waitForTimeout(200);
  await page.screenshot({path:'output/playwright/e3b-project-list.png',fullPage:true});
  await project.getByRole('button',{name:'在地图中查看',exact:true}).click();await page.getByRole('complementary',{name:'空间地图对象详情'}).getByRole('heading',{name:'项目乙',exact:true}).waitFor();
  await page.getByRole('button',{name:'查看项目关系',exact:true}).click();
  const graph=page.getByRole('region',{name:'项目直接关系图'});await graph.waitFor();
  const selected=graph.locator('.relation-project-list button[aria-pressed="true"]');if(!(await selected.textContent()).includes('项目乙'))throw new Error('地图到关系图丢失项目');
  await graph.locator('.relation-project-list').getByRole('button',{name:/项目甲/}).click();await page.getByRole('button',{name:'项目列表',exact:true}).click();await project.getByRole('heading',{name:'项目甲',exact:true}).waitFor();
  await page.getByLabel('搜索项目').fill('项目乙');await project.getByRole('heading',{name:'项目乙',exact:true}).waitFor();
  await nav.getByRole('button',{name:'清理',exact:true}).click();await nav.getByRole('button',{name:'空间',exact:true}).click();await page.getByRole('button',{name:'项目空间',exact:true}).click();await project.getByRole('heading',{name:'项目乙',exact:true}).waitFor();
  await page.getByLabel('搜索项目').fill('');await page.evaluate(()=>window.projectVariant='new');await scan();await project.getByRole('heading',{name:'新项目',exact:true}).waitFor();
  if(await page.getByRole('button',{name:'选择项目 项目乙',exact:true}).count())throw new Error('新报告仍显示旧项目');
  await page.setViewportSize({width:960,height:760});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('窄窗口溢出');
  if(await page.evaluate(()=>window.calls.some(c=>/execute|prepare_cleanup|reveal_/.test(c.cmd))))throw new Error('只读选择触发处理');
  if(errors.length)throw new Error(errors.join('\n'));console.log('通过：目录选择零IPC／明确打开、列表地图一致、项目跨视图／过滤／切页／新报告、键盘与960px（模拟IPC）');
}
