import type { ModelEntry, ProjectReport } from "./types";

export type Project = ProjectReport["projects"][number];
export interface RelationNode {
  id: string;
  kind: "project" | "artifact" | "model" | "process";
  label: string;
  project?: Project;
  artifact?: Project["artifacts"][number];
  model?: ModelEntry;
}
export interface RelationEdge {
  id: string;
  source: string;
  target: string;
  kind: "contains" | "model" | "process";
  evidence: string[];
}
export const projectId = (path: string) => JSON.stringify(["project", path]);
export const edgeLabels = {
  contains: "目录包含",
  model: "配置引用",
  process: "可见路径引用",
};

export function relationships(report: ProjectReport) {
  const nodes = new Map<string, RelationNode>();
  const edges = new Map<string, RelationEdge>();
  const add = (
    source: string,
    target: string,
    kind: RelationEdge["kind"],
    evidence: string,
  ) => {
    const id = JSON.stringify([source, target, kind]);
    const edge = edges.get(id) ?? { id, source, target, kind, evidence: [] };
    if (!edge.evidence.includes(evidence)) edge.evidence.push(evidence);
    edges.set(id, edge);
  };
  for (const project of report.projects) {
    const id = projectId(project.path);
    nodes.set(id, { id, kind: "project", label: project.name, project });
    for (const artifact of project.artifacts) {
      const target = JSON.stringify(["artifact", project.path, artifact.name]);
      nodes.set(target, {
        id: target,
        kind: "artifact",
        label: artifact.name,
        artifact,
        project,
      });
      add(
        id,
        target,
        "contains",
        `扫描到项目直接子目录：${project.path || "."}/${artifact.name}；目录包含不证明可安全删除。`,
      );
    }
    for (const evidence of project.evidence) {
      if (evidence.kind === "model" && evidence.model && evidence.source) {
        const target = JSON.stringify(["model", "ollama", evidence.model]);
        nodes.set(target, { id: target, kind: "model", label: evidence.model, model: report.modelStorage?.models.find(m => m.referenceName === evidence.model) });
        add(id, target, "model", `${evidence.source}：${evidence.message}`);
      } else if (
        evidence.kind === "process" &&
        Number.isSafeInteger(evidence.pid) &&
        evidence.pid! > 0
      ) {
        const source = JSON.stringify(["process", evidence.pid]);
        nodes.set(source, {
          id: source,
          kind: "process",
          label: `PID ${evidence.pid}`,
        });
        add(source, id, "process", evidence.message);
      }
    }
  }
  return { nodes, edges: [...edges.values()] };
}
