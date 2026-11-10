import { matchesAppReport, compareAssociation, visibleApplications, visibleSources } from "../src/appAssociation";
import type { ResidueReport, UninstallRecord } from "../src/types";
function check(value: unknown, message: string) { if (!value) throw new Error(message); }
const record: UninstallRecord = { at: 20, name: "应用", path: "/Applications/App.app", bundleId: "org.fixture.app", success: true, message: "已移到废纸篓", before: {ruleVersion:2, measuredAt:10,sources:[{name:"缓存",path:"/fixture/cache",status:"complete",present:true,allocatedBytes:4096}]} };
const report: ResidueReport = { id:1, measuredAt:30, ruleVersion:2, target:"org.fixture.app",sources:[{name:"缓存",path:"/fixture/cache",coverage:{status:"complete",permissionDenied:0,excluded:0,limited:false,cancelled:false},candidates:[{id:1,path:"/fixture/cache",category:"缓存",evidence:"精确路径",allocatedBytes:8192,logicalBytes:10,cleanupEligible:false}]}] };
check(compareAssociation(record,report)?.[0].status==="仍存在关联项", "应保留存在状态");
for (const status of ["denied","pending","limited","failed"] as const) {
 const partial={...report,sources:[{...report.sources[0],coverage:{...report.sources[0].coverage,status},candidates:[]}]};
 check(compareAssociation(record,partial)?.[0].status==="无法判断", "不完整不能算消失");
 check(compareAssociation(record,partial)?.[0].afterBytes===null,"部分不能显示完整占用");
}
const absent={...report,sources:[{...report.sources[0],coverage:{...report.sources[0].coverage,status:"absent" as const},candidates:[]}]};
check(compareAssociation(record,absent)?.[0].status==="本次未发现", "不存在状态应单独说明");
check(compareAssociation(record,{...report,sources:[]})?.[0].status==="无法判断", "缺来源不能算消失");
for (const other of [{...report,ruleVersion:1},{...report,target:"org.other.app"},{...report,measuredAt:20},{...report,ruleVersion:undefined}]) check(compareAssociation(record,other)===null,"不兼容不能比较");
check(compareAssociation({...record,before:undefined},report)===null,"旧历史不能造基线");
check(compareAssociation({...record,success:false},report)===null,"失败操作不作卸载后对比");
const wasAbsent={...record,before:{...record.before!,sources:[{...record.before!.sources[0],present:false,status:"absent",allocatedBytes:null}]}};
check(compareAssociation(wasAbsent,report)?.[0].status==="本次新发现","应区分新增来源");
check(compareAssociation(wasAbsent,absent)?.[0].status==="前后均未发现","应区分两次未发现");
console.log("通过：关联对照的身份、版本、时间、旧记录、存在／缺失及不完整状态。");

const apps=[{path:"/Applications/A.app",name:"A独有",bundleId:"org.fixture.same"},{path:"/Applications/B.app",name:"B",bundleId:"org.fixture.same"},{path:"/Applications/Apple.app",name:"C",bundleId:"com.apple.test"},{path:"/Applications/Self.app",name:"D",bundleId:"local.diskcare.desktop"}];
check(visibleApplications(apps,"","copies",false).length===2,"多个副本按完整发现列表分组");
check(visibleApplications(apps,"独有","copies",false).length===1,"搜索不能丢掉已有副本关系");
check(visibleApplications(apps,"","protected",false).length===2,"保护标识分组");
check(visibleApplications(apps,"","all",true)[0].name==="D","名称倒序");
check(apps[0].name==="A独有","排序不能修改原目录");
check(visibleSources(report,"content").length===1,"有内容筛选");
check(visibleSources(absent,"content").length===0,"不存在不算有内容");
check(visibleSources(absent,"attention").length===0,"不存在不等于失败");
check(visibleSources({...report,sources:[{...report.sources[0],coverage:{...report.sources[0].coverage,status:"denied"},candidates:[]}]},"attention").length===1,"拒绝必须可筛出");
console.log("通过：应用副本／保护分组、搜索与排序，以及关联来源筛选。");

const selectedPath="/Applications/App.app";
const installedReport={...report,targetAppPath:selectedPath};
check(matchesAppReport(installedReport,report.target,selectedPath,false),"同标识同路径报告可展示");
check(!matchesAppReport(installedReport,report.target,"/Applications/Other.app",false),"同标识不同副本不能串报告");
check(!matchesAppReport(installedReport,report.target,"",false),"安装报告不能作为手动标识报告");
check(!matchesAppReport(report,report.target,selectedPath,false),"缺包身份的报告不能绑定已安装副本");
check(matchesAppReport(report,report.target,"",false),"手动同标识报告可展示");
check(!matchesAppReport(report,"org.other.app","",false),"不同标识不能串报告");
const presetReport={...report,target:"cc-switch（历史样例专属路径）"};
check(matchesAppReport(presetReport,"","",true),"准确样例目标可展示");
check(!matchesAppReport(report,report.target,"",true),"通用报告不能当作样例");
check(!matchesAppReport(null,report.target,"",false),"空报告无匹配结果");
console.log("通过：应用包、标识与特殊样例报告目标匹配及副本隔离。");
