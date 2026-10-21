import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Disk, Listing, Plan, ProjectReport, Record, Scan } from "./types";
export const desktop = isTauri();
export const api = {
  disk: () => invoke<Disk>("disk_info"),
  scan: (extended = false) => invoke<Scan>("scan_disk", { extended }),
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
