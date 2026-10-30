"""复用已有 Ghidra 项目的定点导出，不重新导入／分析或启动目标应用。"""
from pathlib import Path
import argparse
import os
import subprocess

root=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('module',choices=['JunkCleanupModule','CleaningCore'])
parser.add_argument('label',help='新的输出目录／JSON 名称，不得覆盖已有证据')
parser.add_argument('script',choices=['DumpFunctions.java','BindingReferences.java'])
parser.add_argument('addresses',nargs='*')
args=parser.parse_args()
if Path(args.label).name!=args.label or args.label in ('.','..'):
    parser.error('输出名称不能包含目录或路径跳转')
if args.script=='DumpFunctions.java' and not 1<=len(args.addresses)<=31:
    parser.error('函数导出需要 1—31 个地址')
out=root/'output/cleanmymac-re/cleaner-binding'
out.mkdir(parents=True,exist_ok=True)
if (out/args.label).exists() or (out/(args.label+'.log')).exists():
    parser.error('输出已存在；请使用新的名称以保留历史证据')
if args.module=='CleaningCore':
    projects=root/'output/cleanmymac-re/system-junk/projects';project='cleaning-core'
else:
    projects=root/'output/cleanmymac-re/knowledge-base/projects';project='JunkCleanupModule'
env={key:os.environ[key]for key in ['HOME','TMPDIR','LANG','USER','LOGNAME']if key in os.environ}
env.update(JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
           PATH='/opt/homebrew/opt/openjdk@21/bin:/usr/bin:/bin:/usr/sbin:/sbin')
command=['bash',str(root/'output/cleanmymac-re/tools/ghidra_12.1.4_PUBLIC/support/analyzeHeadless'),
         str(projects),project,'-process',args.module+'.arm64','-noanalysis','-scriptPath',str(Path(__file__).parent),
         '-postScript',args.script,str(out/args.label),*args.addresses]
with (out/(args.label+'.log')).open('w') as log:
    result=subprocess.run(command,env=env,stdout=log,stderr=log,timeout=240)
print(args.label,result.returncode)
raise SystemExit(result.returncode)
