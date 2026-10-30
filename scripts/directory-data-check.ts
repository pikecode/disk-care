import { directorySpaces, fileKind, filterLargeFiles } from "../src/directoryData";
import { layoutSpaces } from "../src/spaceLayout";
import type { Item, LargeFile } from "../src/types";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const entry = { id: "folder", name: "目录", category: "目录", bytes: 9, complete: true, issues: 0 } as Item;
const items = directorySpaces({ mapItems: [entry], otherBytes: 1, otherCount: 200, complete: false });
check(items.length === 2 && items[1].kind === "group", "聚合不依赖已加载列表");
check(items.reduce((sum, item) => sum + item.bytes, 0) === 10, "保留所有正占用权重");
check(items.every(item => !item.complete), "部分结果不宣称完整");
const layout = layoutSpaces(items);
check(Math.abs(layout[0].width * layout[0].height - 9000) < 1e-7, "复用布局后面积仍守恒");
check(directorySpaces({ complete: true }).length === 0, "旧数据不猜测全层地图");
const files: LargeFile[] = [
  { path: "/fixture/movie.MOV", relative: "movie.MOV", logicalBytes: 20, allocatedBytes: 0, modifiedAt: 1 },
  { path: "/fixture/setup.dmg", relative: "setup.dmg", logicalBytes: 30, allocatedBytes: 10, modifiedAt: null },
];
check(filterLargeFiles(files, "", 1, "all", "")[0].relative === "setup.dmg", "按逻辑大小排序，保留稀疏文件");
check(filterLargeFiles(files, "MOVIE", 1, "video", "2020-01-01").length === 1, "大小写、类型与时间筛选");
check(filterLargeFiles(files, "", 25, "all", "").length === 1, "最小逻辑大小");
check(filterLargeFiles(files, "", 1, "all", "2020-01-01").length === 1, "未知时间不推断老旧");
check(fileKind("/a/archive.TAR") === "archive" && fileKind("/a/no-extension") === "other", "按扩展名分类，不读取正文");
console.log("目录数据断言通过：全层聚合、部分／旧数据、面积、大小／类型／时间筛选与稀疏文件。");
