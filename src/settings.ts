import type { AppSettingsV1, UiDensity, UiMotion, UiPreferencesV1, UiThemeVariant } from "./types";

export const SETTINGS_STORAGE_KEY = "kiloapp.settings.v1";

export const DEFAULT_UI_PREFERENCES: UiPreferencesV1 = {
  schemaVersion: 1,
  themeVariant: "classic",
  density: "comfortable",
  motion: "full",
};

const DEFAULT_SETTINGS: AppSettingsV1 = {
  schemaVersion: 1,
  lastWorkspace: "",
  reportIssuesTo: "https://github.com/joshmalone/KiloApp/issues/new",
  ui: DEFAULT_UI_PREFERENCES,
};

function parseThemeVariant(value: unknown): UiThemeVariant {
  return value === "industrial_neon_v2" ? "industrial_neon_v2" : "classic";
}

function parseDensity(value: unknown): UiDensity {
  return value === "compact" ? "compact" : "comfortable";
}

function parseMotion(value: unknown): UiMotion {
  return value === "reduced" ? "reduced" : "full";
}

function parseUiPreferences(value: unknown): UiPreferencesV1 {
  if (!value || typeof value !== "object") return DEFAULT_UI_PREFERENCES;
  const parsed = value as Partial<UiPreferencesV1>;
  return {
    schemaVersion: 1,
    themeVariant: parseThemeVariant(parsed.themeVariant),
    density: parseDensity(parsed.density),
    motion: parseMotion(parsed.motion),
  };
}

export function readSettings(): AppSettingsV1 {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettingsV1>;
    if (parsed.schemaVersion !== 1) return DEFAULT_SETTINGS;
    return {
      schemaVersion: 1,
      lastWorkspace: typeof parsed.lastWorkspace === "string" ? parsed.lastWorkspace : "",
      reportIssuesTo: typeof parsed.reportIssuesTo === "string" ? parsed.reportIssuesTo : DEFAULT_SETTINGS.reportIssuesTo,
      ui: parseUiPreferences(parsed.ui),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(next: AppSettingsV1): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}
