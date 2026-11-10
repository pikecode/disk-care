async (page) => {
  page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.calls=[];window.intentMode='mixed';
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    const base={path:'/fixture/cache',category:'开发缓存',bytes:1024**2,files:2,complete:true,issues:0,blocked:null,command:'工具原生命令',impact:'重新获取依赖',details:[]};
    const make=(id,name,extra={})=>({...base,id,name,...extra});
    const disk={total:512*1024**3,used:412*1024**3,available:100*1024**3,shared:0};
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.calls.push({cmd,args});
      if(cmd.startsWith('plugin:event|'))return 1;
      if(cmd==='disk_info')return disk;
      if(cmd==='cleanup_history')return [];
      if(cmd==='scan_disk')return {id:Date.now()-(window.intentMode==='stale'?31*60*1000:0),disk,durationMs:12,cancelled:false,extended:false,roots:[],items:[
        make('npm','npm 下载缓存'),make('uv','uv 缓存',{blocked:'已设置保护，保留工具环境',evidence:{ruleId:'uv',version:1,source:'测试',scope:'测试',recovery:'重新获取',protected:true}}),make('pip','pip 缓存',{bytes:0}),
        make('downloads','下载文件',{category:'个人文件',command:null,blocked:'仅分析'}),make('yarn','Yarn 缓存',{command:null,blocked:'仅分析'}),
        make('ollama','Ollama 模型',{category:'模型与数据',command:null,blocked:'仅分析'}),make('docker','Docker 数据',{category:'模型与数据',command:null,blocked:'仅分析'}),make('unknown','未知来源',{command:null}),
        make('poetry','未完成的缓存',{complete:false,issues:1,bytes:0,command:null,coverage:{status:'denied',permissionDenied:1,excluded:0,limited:false,cancelled:false}})
      ]};
      if(cmd==='prepare_cleanup'){
        if(args.ids.join()!=='npm')throw '范围扩大';
        return {token:99,createdAt:Date.now(),estimated:base.bytes,items:[make('npm','npm 下载缓存')]};
      }
      throw new Error(cmd);
    }};
  });
  await page.setViewportSize({width:1180,height:900});await page.goto('http://127.0.0.1:1420');
  async function scan(){await page.locator('.page-heading').getByRole('button',{name:/检查/}).click();await page.getByRole('dialog').getByRole('button',{name:'开始常规扫描',exact:true}).click();await page.getByRole('button',{name:'可以清理',exact:true}).waitFor();}
  await scan();
  const panel=page.getByRole('region',{name:'可清理空间分析'});
  const inventory=page.getByRole('region',{name:'空间清单'});
  if(await page.locator('.item-row').count()!==1)throw new Error('默认未聚焦合格项');
  const selected=page.getByRole('checkbox',{name:'选择npm 下载缓存',exact:true});
  if(await selected.isChecked())throw new Error('自动勾选');await selected.check();
  await panel.getByRole('button',{name:'可以查看',exact:true}).click();
  if(await page.locator('.item-row').count()!==2)throw new Error('查看分组错误');
  if(await page.getByRole('checkbox',{name:'选择全部可清理项',exact:true}).isEnabled())throw new Error('只读分组可全选');
  await page.getByText('其中 1 项不在当前筛选中，预览将完整列出',{exact:true}).waitFor();
  await page.getByRole('button',{name:/预览清理计划/}).click();
  const dialog=page.getByRole('dialog',{name:'确认这次清理'});
  if(await dialog.getByRole('button',{name:'确认清理',exact:true}).isEnabled())throw new Error('预览未经确认可执行');
  await dialog.getByRole('button',{name:'取消',exact:true}).click();
  await panel.getByRole('button',{name:'需要保留',exact:true}).click();
  if(await page.locator('.item-row').count()!==5)throw new Error('保护／未知未完整保留');
  if(await inventory.getByRole('button',{name:/^预览.*清理$/}).count())throw new Error('保留组出现预览');
  await inventory.getByText('已设置保护，保留工具环境',{exact:true}).waitFor();
  await inventory.getByText('未统计',{exact:true}).waitFor();
  for(const name of ['uv 缓存','Ollama 模型','Docker 数据','未知来源','未完成的缓存'])if(await inventory.getByRole('checkbox',{name:'选择'+name,exact:true}).isEnabled())throw new Error('保留项可选：'+name);
  await page.screenshot({path:'output/playwright/cleanup-intents-keep.png',fullPage:true});
  await panel.getByRole('button',{name:'未发现占用 1 项',exact:true}).click();
  if(await page.locator('.item-row').count()!==1)throw new Error('零值混入未访问项');
  await panel.getByRole('button',{name:'可以清理',exact:true}).click();
  await page.screenshot({path:'output/playwright/cleanup-intents-clean.png',fullPage:true});
  await page.setViewportSize({width:960,height:760});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('窄窗口溢出');
  await page.evaluate(()=>window.intentMode='stale');await scan();
  await panel.getByText(/扫描已超过 30 分钟/).waitFor();
  if(await inventory.getByRole('button',{name:'预览npm 下载缓存清理',exact:true}).isEnabled())throw new Error('过期单项仍可预览');
  await page.getByRole('checkbox',{name:'选择npm 下载缓存',exact:true}).check();
  if(await page.getByRole('button',{name:/预览清理计划/}).isEnabled())throw new Error('过期批量仍可预览');
  if(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='prepare_cleanup').length)!==1)throw new Error('分组或过期触发预览');
  if(await page.evaluate(()=>window.calls.some(c=>c.cmd==='execute_cleanup')))throw new Error('确认前执行');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('通过：意图分组、默认聚焦、保护／未知、零值区分、隐藏选择、确认取消、过期单项／批量阻止与窄窗口（模拟IPC）');
}
