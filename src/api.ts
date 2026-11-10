import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ScanOrigin, ScanActivityReport, DeveloperReport, DeveloperPreview, AppUsage, UninstallRecord, UninstallPreview, UninstallResult, AppCatalog, ResidueReport, AiReport, AiRoot, Disk, Item, Listing, Plan, ProjectReport, Record, Scan } from "./types";
export const desktop = isTauri();
export const api = {
  developerTools: (ids: string[], selectedId?: string) => invoke<DeveloperReport>("analyze_developer_tools", {ids, selectedId}),
  previewHomebrew: () => invoke<DeveloperPreview>("preview_homebrew_cleanup"),
  chooseAnalysisDirectory: () => invoke<Item | null>("choose_analysis_directory"),
  appUsage: (path: string, bundleId: string) => invoke<AppUsage>("app_usage", { path, bundleId }),
  appIcon: (path: string, bundleId: string) => invoke<string | null>("app_icon", { path, bundleId }),
  uninstallHistory: () => invoke<UninstallRecord[]>("app_uninstall_history"),
  prepareUninstall: (path: string, bundleId: string) => invoke<UninstallPreview>("prepare_app_uninstall", { path, bundleId }),
  executeUninstall: (token: number) => invoke<UninstallResult>("execute_app_uninstall", { token }),
  installedApps: () => invoke<AppCatalog>("installed_apps"),
  inspectResidue: (bundleId: string | null, appPath?: string) => invoke<ResidueReport>("inspect_app_residue", appPath ? { appPath, bundleId } : bundleId === null ? { preset: "cc-switch" } : { bundleId }),
  revealResidue: (reportId: number, candidateId: number) => invoke<void>("reveal_residue_candidate", { reportId, candidateId }),
  revealFile: (id: string, relative: string, measuredAt: number) =>
    invoke<void>("reveal_observed_file", { id, relative, measuredAt }),
  aiData: (roots: AiRoot[]) => invoke<AiReport[]>("analyze_ai_data", { roots }),
  disk: () => invoke<Disk>("disk_info"),
  scanRoots: () => invoke<Item[]>("scan_roots"),
  scan: (extended = false, rootIds?: string[], origin: ScanOrigin = "unknown") => invoke<Scan>("scan_disk", { extended, rootIds, origin }),
  scanActivity: () => invoke<ScanActivityReport>("scan_activity"),
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
