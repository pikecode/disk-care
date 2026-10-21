from pathlib import Path
import os,sys,subprocess
root=Path(__file__).resolve().parents[3];out=root/'output/cleanmymac-re/knowledge-base'
headless=root/'output/cleanmymac-re/tools/ghidra_12.1.4_PUBLIC/support/analyzeHeadless'
env={k:os.environ[k]for k in ['HOME','TMPDIR','LANG','USER','LOGNAME']if k in os.environ};env.update(JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',PATH='/opt/homebrew/opt/openjdk@21/bin:/usr/bin:/bin:/usr/sbin:/sbin')
name=sys.argv[1];mode=sys.argv[2];addresses=sys.argv[3:]
if mode not in ('import','process') or not addresses:
 raise SystemExit('需要模块、import/process 及至少一个地址')
(out/'projects').mkdir(parents=True,exist_ok=True)
args=['bash',str(headless),str(out/'projects'),('main'if name=='CleanMyMac_5'else name),('-import'if mode=='import'else'-process'),str(out/(name+'.arm64'))if mode=='import'else name+'.arm64']
args+=['-analysisTimeoutPerFile','120','-max-cpu','2']if mode=='import'else['-noanalysis']
args+=['-scriptPath',str(root/'scripts/research/cleanmymac'),'-postScript','DumpFunctions.java',str(out/('functions-'+name+'-'+addresses[0])),*addresses]
with(out/(name+'-'+addresses[0]+'.log')).open('w')as log:r=subprocess.run(args,env=env,stdout=log,stderr=log,timeout=240)
print(name,r.returncode,flush=True);sys.exit(r.returncode)
