// Per-device family settings, kept in localStorage.

export interface Settings {
  familyName: string;
  elderName: string;
  elderLanguage: string;
  learnerLanguage: string;
  learnerCity: string;
  /** Capacity of the elder's own katori in ml, measured once by the family. */
  katoriMl: number;
  accessCode: string;
}

const KEY = "andaaz.settings";

export const DEFAULT_SETTINGS: Settings = {
  familyName: "Our family",
  elderName: "Dadi",
  elderLanguage: "hi-IN",
  learnerLanguage: "en-IN",
  learnerCity: "Bengaluru",
  katoriMl: 150,
  accessCode: "",
};

export const KATORI_PHOTO_ID = "katori-photo";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode); settings just won't persist.
  }
}
