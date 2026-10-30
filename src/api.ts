import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ResidueReport, AiReport, AiRoot, Disk, Item, Listing, Plan, ProjectReport, Record, Scan } from "./types";
export const desktop = isTauri();
export const api = {
  inspectResidue: () => invoke<ResidueReport>("inspect_app_residue", { preset: "cc-switch" }),
  revealResidue: (reportId: number, candidateId: number) => invoke<void>("reveal_residue_candidate", { reportId, candidateId }),
  revealFile: (id: string, relative: string, measuredAt: number) =>
    invoke<void>("reveal_observed_file", { id, relative, measuredAt }),
  aiData: (roots: AiRoot[]) => invoke<AiReport[]>("analyze_ai_data", { roots }),
  disk: () => invoke<Disk>("disk_info"),
  scanRoots: () => invoke<Item[]>("scan_roots"),
  scan: (extended = false, rootIds?: string[]) => invoke<Scan>("scan_disk", { extended, rootIds }),
  revealApp: () => invoke<string>("reveal_current_app"),
  privacySettings: () => invoke<void>("open_privacy_settings"),
  cancel: () => invoke<void>("cancel_scan"),
  children: (id: string, relative: string, offset = 0) =>
    invoke<Listing>("list_children", { id, relative, offset }),
  prepare: (scanId: number, ids: string[]) =>
    invoke<Plan>("prepare_cleanup", { scanId, ids }),
  clean: (token: number) => invoke<Record>("execute_cleanup", { token }),
  protectUv: (protectedCache: boolean) =>
    invoke<void>("protect_uv_cache", { protected: protectedCache }),
  history: () => invoke<Record[]>("cleanup_history"),
  projects: (root: string) => invoke<ProjectReport>("scan_projects", { root }),
};
