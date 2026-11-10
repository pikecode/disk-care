export interface Disk {
  total: number;
  available: number;
  used: number;
  shared: number;
}
export interface Coverage {
  diagnostics?: { path: string; reason: string; message: string }[];
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
export interface ScanTiming {
  id: string; name: string; durationMs: number | null;
}
export type ScanOrigin = "cleanup" | "result" | "history" | "unknown";
export interface ScanActivityEntry {
  id: string; sessionId: string; appVersion: string; receivedAt: number;
  finishedAt: number | null; durationMs: number | null; origin: ScanOrigin;
  extended: boolean; requestedRoots: number | null;
  status: "received" | "returned" | "cancelled" | "failed";
}
export interface ScanActivityReport { sessionId: string; appVersion: string; records: ScanActivityEntry[] }
export interface Scan {
  activity?: ScanActivityEntry | null;
  activityWarning?: string | null;
  timings?: ScanTiming[];
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
  coverage?: Coverage;
  mapItems?: Item[];
  otherBytes?: number;
  otherCount?: number;
  largeFiles?: LargeFile[];
  largeFilesTotal?: number;
}
export interface LargeFile {
  path: string;
  relative: string;
  logicalBytes: number;
  allocatedBytes: number;
  modifiedAt: number | null;
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

export interface AiRoot {
  tool: "codex" | "claude";
  path: string;
}
export interface AiItem {
  group: string;
  category: string;
  policy: "protected" | "review" | "unknown";
  ruleId: string;
  ruleVersion: number;
  evidence: string;
  impact: string;
  logicalBytes: number;
  allocatedBytes: number;
  files: number;
  modifiedAt: number | null;
  cleanupEligible: false;
}
export interface AiReport {
  tool: string;
  root: string;
  source: string;
  measuredAt: number;
  coverage: Coverage;
  issues: number;
  notes: string[];
  version: string;
  activity: string;
  logicalBytes: number | null;
  allocatedBytes: number | null;
  items: AiItem[];
}

export interface AppCatalog { apps: { path: string; name: string; bundleId: string; version?: string | null }[]; coverage: Coverage }
export interface ResidueReport {
  identitySource?: string;
  ruleVersion?: number;
  targetAppPath?: string | null;
  target: string;
  id: number; measuredAt: number;
  sources: { impact?: string; name: string; path: string; coverage: Coverage; candidates: {
    id: number; path: string; category: string; evidence: string;
    allocatedBytes: number; logicalBytes: number; cleanupEligible: false;
  }[] }[];
}

export interface UninstallPreview {
  token: number;
  name: string;
  path: string;
  bundleId: string;
  expiresAt: number;
  before?: AssociationSnapshot | null;
}
export interface UninstallResult {
  name: string;
  path: string;
  bundleId: string;
  trashPath: string | null;
  warning?: string | null;
  at?: number;
  before?: AssociationSnapshot | null;
}

export interface UninstallRecord { at: number; name: string; path: string; bundleId: string; success: boolean; message: string; before?: AssociationSnapshot | null }

export interface AssociationSnapshot { ruleVersion: number; measuredAt: number; sources: { name: string; path: string; status: string; present: boolean; allocatedBytes: number | null }[] }

export interface AppUsage { path: string; bundleId: string; measuredAt: number; allocatedBytes: number; entries: number; coverage: Coverage }

export interface DeveloperEntry { tool: string; name: string; path: string | null; kind: string; basis: string; impact: string; allocatedBytes: number | null; entries: number | null; coverage: Coverage }
export interface DeveloperReport { measuredAt: number; entries: DeveloperEntry[]; notes: string[] }
export interface DeveloperPreview { measuredAt: number; executable: string; output: string; truncated: boolean }
