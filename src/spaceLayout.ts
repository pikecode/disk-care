import type { ProjectReport } from "./types";
import type { Project } from "./relationships";

export interface SpaceObject {
  id: string;
  kind: "project" | "artifact" | "group";
  label: string;
  bytes: number;
  complete: boolean;
  tone: "node" | "rust" | "python" | "mixed";
  project?: Project;
  artifact?: Project["artifacts"][number];
  members?: SpaceObject[];
}
export interface SpaceRect {
  item: SpaceObject;
  x: number;
  y: number;
  width: number;
  height: number;
}
const valid = (value: number) => Number.isFinite(value) && value >= 0;
const sorted = (items: SpaceObject[]) =>
  [...items].sort((a, b) => b.bytes - a.bytes || a.id.localeCompare(b.id));

function tone(project: Project): SpaceObject["tone"] {
  return project.languages.length !== 1
    ? "mixed"
    : project.languages[0] === "Node"
      ? "node"
      : project.languages[0] === "Rust"
        ? "rust"
        : project.languages[0] === "Python"
          ? "python"
          : "mixed";
}
export function projectSpaces(report: ProjectReport): SpaceObject[] {
  return sorted(
    report.projects.map((project) => ({
      id: JSON.stringify(["project", project.path]),
      kind: "project" as const,
      label: project.name,
      project,
      tone: tone(project),
      bytes: project.artifacts.reduce(
        (n, a) => n + (valid(a.bytes) ? a.bytes : 0),
        0,
      ),
      complete:
        report.complete &&
        project.artifacts.every((a) => a.complete && valid(a.bytes)),
    })),
  );
}
export function artifactSpaces(
  project: Project,
  complete: boolean,
): SpaceObject[] {
  return sorted(
    project.artifacts.map((artifact) => ({
      id: JSON.stringify(["artifact", project.path, artifact.name]),
      kind: "artifact" as const,
      label: artifact.name,
      artifact,
      project,
      tone: tone(project),
      bytes: valid(artifact.bytes) ? artifact.bytes : 0,
      complete: complete && artifact.complete && valid(artifact.bytes),
    })),
  );
}
export function groupSpaces(items: SpaceObject[], limit = 30): SpaceObject[] {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("聚合上限必须为正整数");
  const positive = sorted(
    items.filter((item) => valid(item.bytes) && item.bytes > 0),
  );
  if (positive.length <= limit) return positive;
  const members = positive.slice(limit);
  return [
    ...positive.slice(0, limit),
    {
      id: JSON.stringify(["group", members.map((item) => item.id)]),
      kind: "group",
      label: `其他 ${members.length} 个项目`,
      bytes: members.reduce((n, item) => n + item.bytes, 0),
      complete: members.every((item) => item.complete),
      tone: "mixed",
      members,
    },
  ];
}

export function layoutSpaces(items: SpaceObject[]): SpaceRect[] {
  const positive = sorted(
    items.filter((item) => valid(item.bytes) && item.bytes > 0),
  );
  const result: SpaceRect[] = [];
  const split = (
    values: SpaceObject[],
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    if (!values.length) return;
    if (values.length === 1) {
      result.push({ item: values[0], x, y, width, height });
      return;
    }
    const total = values.reduce((n, item) => n + item.bytes, 0);
    let index = 1;
    let weight = values[0].bytes;
    while (
      index < values.length - 1 &&
      Math.abs(weight + values[index].bytes - total / 2) <
        Math.abs(weight - total / 2)
    ) {
      weight += values[index++].bytes;
    }
    const ratio = weight / total;
    if (width >= height) {
      split(values.slice(0, index), x, y, width * ratio, height);
      split(
        values.slice(index),
        x + width * ratio,
        y,
        width * (1 - ratio),
        height,
      );
    } else {
      split(values.slice(0, index), x, y, width, height * ratio);
      split(
        values.slice(index),
        x,
        y + height * ratio,
        width,
        height * (1 - ratio),
      );
    }
  };
  split(positive, 0, 0, 100, 100);
  return result;
}
