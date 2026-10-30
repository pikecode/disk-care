// 仅索引清理构造相关符号的有界静态引用，保留引用类型，不能将 DATA 当作调用。
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.*;
import com.google.gson.GsonBuilder;
import java.nio.file.*;
import java.util.*;
public class BindingReferences extends GhidraScript {
 public void run() throws Exception {
  String[] keys={"withCleaner","FilesRemovalTask","FileRemover","JunkCleanupItemsNodeMapper","JunkCleanupRemovalTaskFactory","CommonModuleCleaner","RootNodeCleaner"};
  List<Map<String,Object>> rows=new ArrayList<>();
  List<Symbol> all=new ArrayList<>();
  SymbolIterator symbols=currentProgram.getSymbolTable().getAllSymbols(true);
  while(symbols.hasNext())all.add(symbols.next());
  symbols=currentProgram.getSymbolTable().getExternalSymbols();
  while(symbols.hasNext())all.add(symbols.next());
  for(Symbol symbol:all){
   if(monitor.isCancelled())break;
   String name=symbol.getName(true);boolean match=false;
   for(String key:keys)if(name.contains(key))match=true;
   if(!match)continue;
   Map<String,Object> row=new LinkedHashMap<>();row.put("name",name);row.put("address",symbol.getAddress().toString());
   List<Map<String,Object>> refs=new ArrayList<>();Set<Address> seen=new HashSet<>();List<Address> queue=new ArrayList<>();queue.add(symbol.getAddress());
   for(int depth=0;depth<3;depth++){
    List<Address> next=new ArrayList<>();
    for(Address address:queue){
     if(!seen.add(address))continue;
     for(Reference ref:currentProgram.getReferenceManager().getReferencesTo(address)){
      if(refs.size()>=300)break;
      Function fn=getFunctionContaining(ref.getFromAddress());Map<String,Object> edge=new LinkedHashMap<>();
      edge.put("from",ref.getFromAddress().toString());edge.put("to",address.toString());edge.put("type",ref.getReferenceType().toString());edge.put("depth",depth);
      if(fn!=null){edge.put("functionEntry",fn.getEntryPoint().toString());edge.put("functionName",fn.getName());next.add(fn.getEntryPoint());}else next.add(ref.getFromAddress());
      refs.add(edge);
     }
    }
    queue=next;
   }
   row.put("references",refs);row.put("referenceLimitReached",refs.size()>=300);rows.add(row);
  }
  Files.writeString(Paths.get(getScriptArgs()[0]),new GsonBuilder().setPrettyPrinting().create().toJson(rows));
 }
}
