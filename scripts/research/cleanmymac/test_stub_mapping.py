"""使用独立构造的最小 Mach-O 和已知指令验证地址映射，不加载目标框架。"""
import struct
import unittest
from map_arm64_stubs import stubs, initial_pointer

def fixture(first=0xb0000010, second=0xf9400e10, last=0xd61f0200):
    data=bytearray(204)
    struct.pack_into('<IIIIIIII',data,0,0xfeedfacf,0x100000c,0,6,1,152,0,0)
    struct.pack_into('<II16sQQQQiiII',data,32,0x19,152,b'__TEXT',0x1000,0x3000,0,204,7,5,1,0)
    struct.pack_into('<16s16sQQIIIIIIII',data,104,b'__stubs',b'__TEXT',0x1000,12,184,2,0,0,0,0,12,0)
    struct.pack_into('<III',data,184,first,second,last)
    return data

class StubMappingTests(unittest.TestCase):
    def test_positive_page_and_load_offset(self):
        self.assertEqual(list(stubs(fixture())),[(0x1000,0x2018)])
    def test_negative_page_is_sign_extended(self):
        self.assertEqual(list(stubs(fixture(first=0xf0fffff0))),[(0x1000,0x18)])
    def test_invalid_instruction_is_rejected(self):
        with self.assertRaises(ValueError):list(stubs(fixture(last=0)))
    def test_wrong_cpu_is_rejected(self):
        data=fixture();struct.pack_into('<I',data,4,0x1000007)
        with self.assertRaises(ValueError):list(stubs(data))
    def test_truncated_commands_are_rejected(self):
        with self.assertRaises(ValueError):list(stubs(fixture()[:80]))
    def test_unmapped_pointer_is_rejected(self):
        with self.assertRaises(ValueError):initial_pointer(fixture(),0x5000)
    def test_pointer_uses_file_backed_mapping(self):
        data=fixture();struct.pack_into('<Q',data,196,0x9876)
        self.assertEqual(initial_pointer(data,0x1000+196),0x9876)
if __name__=='__main__':unittest.main()
