export interface Disk {
  total: number;
  available: number;
  used: number;
  shared: number;
}
export interface Coverage {
  status:
    | "complete"
    | "absent"
    | "skipped"
    | "denied"
    | "failed"
    | "limited"
    | "cancelled"
    | "pending";
  permissionDenied: number;
  excluded: number;
  limited: boolean;
  cancelled: boolean;
}
export interface RuleEvidence {
  ruleId: string;
  version: number;
  source: string;
  scope: string;
  recovery: string;
  protected: boolean;
}
export interface Item {
  id: string;
  name: string;
  category: string;
  path: string;
  bytes: number;
  files: number;
  issues: number;
  complete: boolean;
  impact: string;
  command: string | null;
  blocked: string | null;
  details: string[];
  coverage?: Coverage | null;
  evidence?: RuleEvidence | null;
}
export interface Scan {
  extended?: boolean;
  id: number;
  disk: Disk;
  items: Item[];
  roots: Item[];
  durationMs: number;
  cancelled: boolean;
}
export interface Progress {
  name: string;
  done: number;
  total: number;
  files: number;
}
export interface Plan {
  token: number;
  createdAt: number;
  items: Item[];
  estimated: number;
}
export interface Outcome {
  name: string;
  success: boolean;
  message: string;
  status?: "success" | "failed" | "skipped" | null;
  beforeBytes?: number | null;
  afterBytes?: number | null;
  verification?: string | null;
}
export interface Record {
  at: number;
  estimated: number;
  released: number;
  beforeAvailable: number;
  afterAvailable: number;
  outcomes: Outcome[];
  warning: string | null;
  diskVerified?: boolean | null;
}

export interface Listing {
  items: Item[];
  nextOffset: number | null;
  total: number;
  measuredAt: number;
  complete: boolean;
  issues: number;
}

export interface ProjectReport {
  modelStorage?: ModelStorageReport | null;
  root: string;
  measuredAt: number;
  durationMs: number;
  complete: boolean;
  issues: number;
  cancelled: boolean;
  warnings: string[];
  projects: {
    path: string;
    name: string;
    languages: string[];
    artifacts: {
      name: string;
      bytes: number;
      files: number;
      complete: boolean;
      recovery: string;
    }[];
    evidence: {
      kind: string;
      message: string;
      model?: string;
      source?: string;
      pid?: number;
    }[];
  }[];
  baselineAt: number | null;
  changes: { path: string; before: number | null; after: number | null }[];
}

export interface ModelEntry {
  id: string;
  name: string;
  referenceName: string | null;
  blockIds: string[];
  complete: boolean;
  logicalBytes: number;
  allocatedBytes: number;
  sharedBytes: number;
  exclusiveBytes: number | null;
}
export interface ModelStorageReport {
  root: string;
  measuredAt: number;
  status: "complete" | "partial" | "cancelled" | "absent";
  complete: boolean;
  logicalBytes: number;
  allocatedBytes: number;
  models: ModelEntry[];
  blocks: {
    id: string;
    digests: string[];
    logicalBytes: number;
    allocatedBytes: number;
    modelIds: string[];
    externalLinks: boolean;
  }[];
  issues: { kind: string; path: string; message: string }[];
}
