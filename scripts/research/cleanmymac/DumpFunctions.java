// 本轮定点研究：仅导出选定函数的伪代码、直接调用和入口引用。
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import com.google.gson.GsonBuilder;
import java.nio.file.*;
import java.util.*;
public class DumpFunctions extends GhidraScript {
 public void run() throws Exception {
  String[] args=getScriptArgs();
  if(args.length<2||args.length>32)throw new IllegalArgumentException("需要输出目录及 1—31 个函数地址");
  Path out=Paths.get(args[0]);Files.createDirectories(out);
  DecompInterface decompiler=new DecompInterface();
  if(!decompiler.openProgram(currentProgram))throw new IllegalStateException("不能打开分析程序");
  List<Map<String,Object>> rows=new ArrayList<>();
  try {
   for(int i=1;i<args.length;i++){
    // @ 前缀仅用于已知指令地址，明确请求其所属函数；默认仍要求精确入口。
    boolean containing=args[i].startsWith("@");
    Address address=toAddr(containing?args[i].substring(1):args[i]);
    Function f=containing?getFunctionContaining(address):getFunctionAt(address);
    Map<String,Object> row=new LinkedHashMap<>();row.put("requestedAddress",args[i]);row.put("address",f==null?address.toString():f.getEntryPoint().toString());
    if(f==null){row.put("error","未恢复函数入口");rows.add(row);continue;}
    row.put("name",f.getName());row.put("signature",f.getSignature().toString());
    DecompileResults r=decompiler.decompileFunction(f,30,monitor);
    row.put("completed",r.decompileCompleted());row.put("message",r.getErrorMessage());
    if(r.decompileCompleted()&&r.getDecompiledFunction()!=null)Files.writeString(out.resolve(args[i].replace("@","at-")+".c"),r.getDecompiledFunction().getC());
    List<String> calls=new ArrayList<>();for(Function c:f.getCalledFunctions(monitor))calls.add(c.getEntryPoint()+" "+c.getName());row.put("directCalledFunctions",calls);
    List<String> refs=new ArrayList<>();for(Reference ref:currentProgram.getReferenceManager().getReferencesTo(f.getEntryPoint()))refs.add(ref.getFromAddress()+" "+ref.getReferenceType());row.put("entryReferences",refs);rows.add(row);
   }
   Files.writeString(out.resolve("function-index.json"),new GsonBuilder().setPrettyPrinting().create().toJson(rows));
  }finally{decompiler.dispose();}
 }
}
