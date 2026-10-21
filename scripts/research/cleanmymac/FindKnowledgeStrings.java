// 只读搜索指定规则相关字符串，记录静态引用到函数的路径。
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import ghidra.program.model.address.Address;
import com.google.gson.GsonBuilder;
import java.nio.file.*;
import java.util.*;
public class FindKnowledgeStrings extends GhidraScript {
 public void run() throws Exception {
  String[] args=getScriptArgs();Path out=Paths.get(args[0]);
  List<Map<String,Object>> rows=new ArrayList<>();
  DataIterator it=currentProgram.getListing().getDefinedData(true);
  while(it.hasNext()&&!monitor.isCancelled()){
   Data d=it.next();if(!d.hasStringValue())continue;String value=String.valueOf(d.getValue());
   if(!(value.contains("SELECT ")||value.contains("cmmkb")||value.contains("KnowledgeBaseConnectionManager")||value.contains("cipher")||value.contains("PRAGMA")))continue;
   Map<String,Object> row=new LinkedHashMap<>();row.put("address",d.getAddress().toString());row.put("value",value);
   LinkedHashSet<String> functions=new LinkedHashSet<>();List<String> refs=new ArrayList<>();
   List<Address> queue=new ArrayList<>();queue.add(d.getAddress());Set<Address> seen=new HashSet<>();
   for(int depth=0;depth<3;depth++){
    List<Address> next=new ArrayList<>();
    for(Address a:queue){if(!seen.add(a))continue;
     for(Reference r:currentProgram.getReferenceManager().getReferencesTo(a)){
      Function f=getFunctionContaining(r.getFromAddress());
      refs.add(a+" <- "+r.getFromAddress()+" "+r.getReferenceType());
      if(f!=null)functions.add(f.getEntryPoint()+" "+f.getName());else if(seen.size()<128)next.add(r.getFromAddress());
     }
    }
    queue=next;
   }
   row.put("functions",functions);row.put("references",refs);rows.add(row);
  }
  Files.writeString(out,new GsonBuilder().setPrettyPrinting().create().toJson(rows));
 }
}
