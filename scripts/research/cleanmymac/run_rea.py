"""本轮研究的独立 REA 入口；不执行 setup，不传入服务凭据。"""
from pathlib import Path
import os,sys,subprocess,time,json
root=Path(__file__).resolve().parents[3]
out=root/'output/cleanmymac-re/system-junk'
out.mkdir(parents=True,exist_ok=True)
base=root/'output/cleanmymac-re'
env={k:os.environ[k] for k in ['HOME','TMPDIR','LANG','LC_ALL','USER','LOGNAME'] if k in os.environ}
env.update(PATH='/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',GHIDRA_INSTALL_DIR=str(base/'tools/ghidra_12.1.4_PUBLIC'),XDG_CONFIG_HOME=str(base/'config'),XDG_CACHE_HOME=str(base/'cache'),REA_DARWIN_MODULE_CACHE_PATH=str(base/'cache/swift'),REA_GHIDRA_STARTUP_TIMEOUT_MS='240000')
name=sys.argv[1];args=sys.argv[2:];start=time.monotonic()
try:
 result=subprocess.run(['node',str(root/'output/rea-evaluation/runtime/node_modules/rea-agents/scripts/rea.mjs'),*args,'--json'],capture_output=True,env=env,timeout=300)
 (out/(name+'.json')).write_bytes(result.stdout);(out/(name+'.stderr.txt')).write_bytes(result.stderr)
 print(json.dumps(dict(name=name,exit=result.returncode,seconds=round(time.monotonic()-start,2),bytes=len(result.stdout))))
 if result.returncode: print(result.stderr.decode(errors='replace')[-1500:]);print(result.stdout.decode(errors='replace')[-1500:])
 sys.exit(result.returncode)
except subprocess.TimeoutExpired as e:
 (out/(name+'.timeout.txt')).write_text(str(e));raise
