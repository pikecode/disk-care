async (page) => {
  page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.calls=[];window.aiPending=true;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    const coverage=status=>({status,permissionDenied:0,excluded:0,limited:false,cancelled:status==='cancelled'});
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.calls.push({cmd,args});if(cmd.startsWith('plugin:event|'))return 1;
      if(cmd==='disk_info')return {total:100,available:50,used:50,shared:0};
      if(cmd==='cleanup_history')return [];
      if(cmd==='cancel_scan'){window.cancelled=true;window.finishAi?.();window.finishDeveloper?.();return;}
      if(cmd==='analyze_ai_data'){
        if(window.aiPending)await new Promise(r=>window.finishAi=r);
        return args.roots.map(root=>({tool:root.tool,root:root.path,source:'确认路径',version:'测试',activity:'未知',measuredAt:Date.now(),issues:0,notes:[],coverage:coverage(window.cancelled?'cancelled':'complete'),logicalBytes:30,allocatedBytes:30,
          items:[{group:'config',category:'配置与记忆',policy:'protected',allocatedBytes:10,logicalBytes:10,files:1,modifiedAt:null,impact:'保留配置与恢复资料',evidence:'规则元数据',ruleId:'config',ruleVersion:1,cleanupEligible:false},{group:'sessions/run',category:'会话记录',policy:'review',allocatedBytes:20,logicalBytes:20,files:2,modifiedAt:1,impact:'先确认会话用途',evidence:'规则元数据',ruleId:'sessions',ruleVersion:1,cleanupEligible:false}]}));
      }
      if(cmd==='analyze_developer_tools'){
        await new Promise(r=>window.finishDeveloper=r);
        return {measuredAt:Date.now(),notes:[],entries:args.ids.map(tool=>({tool,name:'工具位置',path:'/fixture/'+tool,kind:'未确认',basis:'取消后未访问',impact:'不代表没有数据',allocatedBytes:null,entries:null,coverage:coverage('cancelled')}))};
      }
      if(cmd==='preview_homebrew_cleanup'){await new Promise(r=>window.finishPreview=r);return {measuredAt:Date.now(),executable:'/fixture/brew',output:'工具预览结束',truncated:false};}
      throw new Error(cmd);
    }};
  });
  await page.setViewportSize({width:1180,height:820});await page.goto('http://127.0.0.1:1420');
  const nav=page.getByRole('navigation',{name:'主导航'});
  async function aiPage(){await nav.getByRole('button',{name:'空间',exact:true}).click();await page.getByRole('navigation',{name:'空间分类'}).getByRole('button',{name:'AI 数据',exact:true}).click();}
  await aiPage();await page.getByLabel('Claude Code',{exact:true}).uncheck();await page.getByLabel('Codex 数据目录',{exact:true}).fill('~/custom-ai');
  const start=page.getByRole('button',{name:'开始只读分析',exact:true});await start.click();
  await nav.getByRole('button',{name:'清理',exact:true}).click();
  const task=page.getByRole('status',{name:'进行中的任务'});
  await task.getByText('AI 数据正在分析',{exact:true}).waitFor();
  await task.getByRole('button',{name:'返回AI 数据',exact:true}).click();
  if(await page.getByLabel('Codex 数据目录',{exact:true}).inputValue()!=='~/custom-ai')throw new Error('跨页丢失确认范围');
  await nav.getByRole('button',{name:'清理',exact:true}).click();await task.getByRole('button',{name:'停止分析',exact:true}).click();
  await task.waitFor({state:'hidden'});await aiPage();
  await page.evaluate(()=>{window.aiPending=false;window.cancelled=false;});await start.click();
  const result=page.getByRole('article',{name:'codex 分析结果'});await result.getByRole('region',{name:'AI分组详情'}).getByRole('heading',{name:'sessions/run',exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.calls.length);
  await result.getByRole('button',{name:'选择分组 config',exact:true}).focus();await page.keyboard.press('Enter');
  const inspector=result.getByRole('region',{name:'AI分组详情'});
  await inspector.getByRole('heading',{name:'config',exact:true}).waitFor();await inspector.getByText('保留配置与恢复资料',{exact:true}).waitFor();
  if(await page.evaluate(()=>window.calls.length)!==calls)throw new Error('选中分组触发读盘');
  await nav.getByRole('button',{name:'清理',exact:true}).click();await aiPage();await inspector.getByRole('heading',{name:'config',exact:true}).waitFor();
  await result.getByLabel('数据策略').selectOption('review');await inspector.getByRole('heading',{name:'sessions/run',exact:true}).waitFor();
  await inspector.getByText('路径与识别依据',{exact:true}).click();await inspector.getByText('~/custom-ai/sessions/run',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/space-ai-inspector.png',fullPage:true});
  await page.getByRole('navigation',{name:'空间分类'}).getByRole('button',{name:'开发工具',exact:true}).click();
  await page.getByRole('button',{name:'检查开发工具',exact:true}).click();await page.getByRole('dialog',{name:'检查哪些工具？'}).getByRole('button',{name:'确认并检查',exact:true}).click();
  await nav.getByRole('button',{name:'清理',exact:true}).click();await task.getByText('开发工具正在检查',{exact:true}).waitFor();await task.getByRole('button',{name:'停止分析',exact:true}).click();await task.waitFor({state:'hidden'});
  await nav.getByRole('button',{name:'空间',exact:true}).click();await page.getByRole('navigation',{name:'空间分类'}).getByRole('button',{name:'开发工具',exact:true}).click();
  await page.getByText('高级：Homebrew 清理建议',{exact:true}).click();await page.getByRole('button',{name:'读取 Homebrew 清理预览',exact:true}).click();
  await nav.getByRole('button',{name:'清理',exact:true}).click();await task.getByText('正在读取 Homebrew 预览',{exact:true}).waitFor();
  if(await task.getByRole('button',{name:'停止分析',exact:true}).count())throw new Error('原生预览提供无效取消');
  await page.screenshot({path:'output/playwright/space-background-task.png'});
  await task.getByRole('button',{name:'返回开发工具',exact:true}).click();await page.evaluate(()=>window.finishPreview());await page.getByText('工具预览结束',{exact:true}).waitFor();
  await page.setViewportSize({width:960,height:760});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('窄窗口溢出');
  if(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='analyze_ai_data').length)!==2)throw new Error('导航重启任务');
  if(await page.evaluate(()=>window.calls.some(c=>/execute|prepare_cleanup/.test(c.cmd))))throw new Error('只读流程触发清理');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('通过：AI对象选择／保护／过滤／切页保留、任务返回与停止、原生预览不可取消、零额外分析与零删除（模拟IPC）');
}
