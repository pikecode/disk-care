"""只读匹配 arm64 ADRP/LDR/BR 调用桩与 dyld_info 绑定；不执行目标代码。"""
from pathlib import Path
import json,re,struct,sys

def load_commands(data):
    if len(data)<32 or struct.unpack_from('<II',data)!=(0xfeedfacf,0x100000c):
        raise ValueError('需要 arm64 的 64 位小端 Mach-O 切片')
    position=32
    for _ in range(struct.unpack_from('<I',data,16)[0]):
        command,size=struct.unpack_from('<II',data,position)
        if size<8 or position+size>len(data):raise ValueError('加载命令越界')
        yield position,command,size
        position+=size

def stubs(data):
    for position,command,size in load_commands(data):
        if command==0x19:
            for index in range(struct.unpack_from('<I',data,position+64)[0]):
                section=position+72+index*80
                if section+80>position+size:raise ValueError('节记录越界')
                if data[section:section+16].rstrip(b'\0')==b'__stubs':
                    address,length,offset=struct.unpack_from('<QQI',data,section+32)
                    stride=struct.unpack_from('<I',data,section+72)[0]
                    if stride!=12 or length%12 or offset+length>len(data):raise ValueError('不支持的调用桩布局')
                    for delta in range(0,length,12):
                        a,b,c=struct.unpack_from('<III',data,offset+delta)
                        if a&0x9f00001f!=0x90000010 or b&0xffc003ff!=0xf9400210 or c!=0xd61f0200:
                            raise ValueError(f'调用桩指令不匹配：{address+delta:x}')
                        immediate=(((a>>5)&0x7ffff)<<2)|((a>>29)&3)
                        if immediate&(1<<20):immediate-=1<<21
                        pointer=((address+delta)&~0xfff)+(immediate<<12)+(((b>>10)&0xfff)*8)
                        yield address+delta,pointer

def initial_pointer(data,address):
    for position,command,size in load_commands(data):
        if command==0x19:
            vm,_,offset,length=struct.unpack_from('<QQQQ',data,position+24)
            if vm<=address and address+8<=vm+length:
                return struct.unpack_from('<Q',data,offset+address-vm)[0]
    raise ValueError('绑定指针不在文件支持的映射中')

def main():
    binary,fixups,disassembly,output=map(Path,sys.argv[1:])
    bindings={int(m[1],16):m[2] for m in re.finditer(r'__la_symbol_ptr\s+(0x[\dA-Fa-f]+)\s+lazy-bind\s+(.+)',fixups.read_text())}
    calls={}
    for m in re.finditer(r'^([\da-f]+)\s+bl\s+0x([\da-f]+)',disassembly.read_text(),re.M):calls.setdefault(int(m[2],16),[]).append('0x'+m[1].lstrip('0'))
    data=binary.read_bytes()
    rows=[{'stub':hex(stub),'pointer':hex(pointer),'initialTarget':hex(initial_pointer(data,pointer)),
           'binding':bindings.get(pointer),'callSites':calls.get(stub,[])}for stub,pointer in stubs(data)]
    output.write_text(json.dumps({'total':len(rows),'bound':sum(r['binding']is not None for r in rows),'stubs':rows},ensure_ascii=False,indent=2)+'\n')
    print('调用桩数量',len(rows),'绑定成功',sum(r['binding']is not None for r in rows))
if __name__=='__main__':main()
