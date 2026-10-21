async (page) => {
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.isTauri=true;window.modelMode="complete";window.modelCalls=[];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    window.__TAURI_INTERNALS__={transformCallback(){return 1;},async invoke(cmd,args){
      window.modelCalls.push(cmd);
      if(cmd.startsWith("plugin:event|"))return 1;
      if(cmd==="disk_info")return {total:1000,available:400,used:500,shared:100};
      if(cmd==="cleanup_history")return [];
      if(cmd!=="scan_projects")throw Error("不应调用 "+cmd);
      const cancelled=window.modelMode==="cancelled",partial=window.modelMode==="partial"||window.modelMode==="cancelled",absent=window.modelMode==="absent",legacy=window.modelMode==="legacy";
      return {root:args.root,measuredAt:Date.now(),durationMs:100,complete:!partial,cancelled:false,issues:0,warnings:[],baselineAt:null,changes:[],
        projects:[{path:"demo",name:"模型项目",languages:["Python"],artifacts:[],evidence:[{kind:"model",model:"qwen:latest",source:"config.json",message:"配置引用不证明真实调用"}]}],
        modelStorage:legacy?undefined:{root:"/Users/demo/.ollama/models",measuredAt:Date.now(),status:absent?"absent":cancelled?"cancelled":partial?"partial":"complete",complete:!partial,allocatedBytes:absent?0:123*8192,logicalBytes:absent?0:123*6000,
          models:absent?[]:Array.from({length:23},(_,i)=>({id:"m"+i,name:i===0?"qwen:latest":"model-"+i,referenceName:i===0?"qwen:latest":null,blockIds:Array.from({length:123},(_,i)=>"b"+i),complete:true,logicalBytes:123*6000,allocatedBytes:123*8192,sharedBytes:123*8192,exclusiveBytes:partial?null:0})),
          blocks:absent?[]:Array.from({length:123},(_,i)=>({id:"b"+i,digests:["sha256:"+i.toString(16).padStart(64,"0")],logicalBytes:6000,allocatedBytes:8192,modelIds:Array.from({length:23},(_,i)=>"m"+i),externalLinks:false})),issues:partial?[{kind:"invalidManifest",path:"/demo/manifest",message:"清单字段无效"}]:[]}
      };
    }};
  });
  await page.goto("http://127.0.0.1:1420");
  await page.getByRole("button",{name:"项目账本",exact:true}).click();
  const scan=async(mode)=>{
    await page.evaluate(m=>{window.modelMode=m;},mode);
    await page.getByRole("button",{name:"扫描项目",exact:true}).click();
    await page.getByText("项目扫描会读取什么？",{exact:true}).click();
    await page.getByText(/同时读取 ~\/.ollama\/models/).waitFor();
    await page.getByRole("checkbox",{name:"我已了解范围与权限要求，继续扫描"}).check();
    await page.getByRole("button",{name:"开始项目扫描",exact:true}).click();
    await page.getByText("已测量产物目录",{exact:true}).waitFor();
  };
  await scan("complete");
  const ledger=page.locator(".model-storage");
  if(await ledger.getAttribute("open")!==null)throw Error("模型账本默认应折叠");
  await ledger.locator(":scope > summary").click();
  if(await page.locator(".model-storage-row").count()!==20)throw Error("初始模型分页错误");
  await page.getByRole("button",{name:"更多模型",exact:true}).click();
  if(await page.locator(".model-storage-row").count()!==23)throw Error("更多模型错误");
  await page.getByLabel("搜索本地模型").fill("qwen");
  if(await page.locator(".model-storage-row").count()!==1)throw Error("模型筛选错误");
  await page.locator(".model-storage-row > summary").click();
  await page.getByText("本次清单范围内独占占用",{exact:true}).waitFor();
  if(await page.locator(".model-block-list li").count())throw Error("文件块不应在展开前渲染");
  const evidence=page.getByText("查看文件块依据（123）",{exact:true});
  await evidence.click();
  await page.waitForFunction(()=>document.querySelectorAll(".model-block-list li").length===50);
  await page.getByRole("button",{name:"更多文件块",exact:true}).click();
  if(await page.locator(".model-block-list li").count()!==100)throw Error("文件块第二页数量错误");
  await page.getByRole("button",{name:"更多文件块",exact:true}).click();
  if(await page.locator(".model-block-list li").count()!==123)throw Error("文件块最后一页数量错误");
  if(await page.getByRole("button",{name:"更多文件块",exact:true}).count())throw Error("最后一页不应再有更多入口");
  await evidence.click();
  await page.waitForFunction(()=>document.querySelectorAll(".model-block-list li").length===0);
  await evidence.click();
  await page.waitForFunction(()=>document.querySelectorAll(".model-block-list li").length===50);

  await page.getByRole("button",{name:"模型项目 · 查看关系",exact:true}).click();
  if(await page.locator(".relationship-view").count()!==1)throw Error("未切到项目关系");
  await page.waitForFunction(()=>document.activeElement?.classList.contains("relationship-view"));
  if(!await page.locator(".relation-node.model").innerText().then(t=>t.includes("关联占用")))throw Error("模型关系未显示测量值");
  await page.setViewportSize({width:960,height:660});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error("小窗口横向溢出");
  await page.screenshot({path:"output/playwright/model-storage-091.png",fullPage:true});
  await scan("partial");
  if(!(await ledger.locator(":scope > summary").innerText()).includes("统计不完整"))throw Error("折叠摘要隐藏了不完整状态");
  await ledger.locator(":scope > summary").click();
  await page.getByText(/模型统计不完整/).waitFor();
  await page.locator(".model-storage-row > summary").first().click();
  await page.getByText("无法确认",{exact:true}).first().waitFor();
  await page.getByText("查看模型读取问题（最多显示 64 条）",{exact:true}).click();
  await page.getByText("清单字段无效",{exact:true}).waitFor();
  await scan("cancelled");
  if(!(await ledger.locator(":scope > summary").innerText()).includes("已停止"))throw Error("折叠摘要隐藏了停止状态");
  await scan("absent");
  await page.getByText("默认目录未发现",{exact:true}).waitFor();
  await ledger.locator(":scope > summary").click();
  await page.getByText(/没有发现不代表没有模型/).waitFor();
  await scan("legacy");
  if(await ledger.count())throw Error("旧报告不应显示虚假模型数据");
  const calls=await page.evaluate(()=>window.modelCalls);
  if(calls.some(c=>c==="execute_cleanup"||c==="prepare_cleanup"))throw Error("模型分析不得触发清理");
  if(errors.length)throw Error(errors.join("\n"));
  console.log("模型账本通过：完整、部分、默认目录缺失、旧报告、分页、搜索、配置引用、关系图测量值、文件块按需渲染及分页、折叠状态、小窗口及无清理调用。全部为模拟 IPC。");
};
