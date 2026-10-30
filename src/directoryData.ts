import type { LargeFile, Listing } from "./types";
import type { SpaceObject } from "./spaceLayout";

export function directorySpaces(data: Pick<Listing, "mapItems" | "otherBytes" | "otherCount" | "complete">): SpaceObject[] {
  const items: SpaceObject[] = (data.mapItems ?? []).map(entry => ({
    id: JSON.stringify(["entry", entry.id]), label: entry.name, bytes: entry.bytes,
    kind: entry.category === "目录" ? "directory" : "file",
    complete: data.complete && entry.complete && entry.issues === 0,
    tone: entry.category === "目录" ? "mixed" : "node", entry,
  }));
  if ((data.otherBytes ?? 0) > 0 && (data.otherCount ?? 0) > 0) items.push({
    id: JSON.stringify(["other"]), label: `其他 ${data.otherCount} 项`, kind: "group",
    bytes: data.otherBytes!, complete: data.complete, tone: "mixed",
  });
  return items;
}

export function fileKind(path: string): string {
  const extension = path.split("/").at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(extension)) return "video";
  if (["dmg", "pkg", "iso"].includes(extension)) return "installer";
  if (["zip", "gz", "xz", "tar", "7z", "rar"].includes(extension)) return "archive";
  return "other";
}

export function filterLargeFiles(files: LargeFile[], query: string, minimum: number, kind: string, before: string): LargeFile[] {
  const cutoff = before ? new Date(`${before}T00:00:00`).getTime() : null;
  return files.filter(file => file.logicalBytes >= minimum
    && file.path.toLowerCase().includes(query.trim().toLowerCase())
    && (kind === "all" || fileKind(file.path) === kind)
    && (cutoff === null || (file.modifiedAt !== null && file.modifiedAt < cutoff)))
    .sort((a, b) => b.logicalBytes - a.logicalBytes || a.path.localeCompare(b.path));
}
