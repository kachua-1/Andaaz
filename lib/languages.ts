// Languages Sarvam supports. Saaras v3 (speech to text) and Sarvam Translate cover all of
// them; Bulbul v3 (text to speech) covers the ones marked `tts`.

export interface Language {
  code: string;
  name: string;
  native: string;
  tts: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "hi-IN", name: "Hindi", native: "हिन्दी", tts: true },
  { code: "bn-IN", name: "Bengali", native: "বাংলা", tts: true },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்", tts: true },
  { code: "te-IN", name: "Telugu", native: "తెలుగు", tts: true },
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ", tts: true },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം", tts: true },
  { code: "mr-IN", name: "Marathi", native: "मराठी", tts: true },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી", tts: true },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ", tts: true },
  { code: "od-IN", name: "Odia", native: "ଓଡ଼ିଆ", tts: true },
  { code: "en-IN", name: "English", native: "English", tts: true },
  { code: "as-IN", name: "Assamese", native: "অসমীয়া", tts: false },
  { code: "ur-IN", name: "Urdu", native: "اردو", tts: false },
  { code: "ne-IN", name: "Nepali", native: "नेपाली", tts: false },
  { code: "kok-IN", name: "Konkani", native: "कोंकणी", tts: false },
  { code: "mai-IN", name: "Maithili", native: "मैथिली", tts: false },
  { code: "ks-IN", name: "Kashmiri", native: "कॉशुर", tts: false },
  { code: "sd-IN", name: "Sindhi", native: "سنڌي", tts: false },
  { code: "doi-IN", name: "Dogri", native: "डोगरी", tts: false },
  { code: "sa-IN", name: "Sanskrit", native: "संस्कृतम्", tts: false },
  { code: "sat-IN", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ", tts: false },
  { code: "mni-IN", name: "Manipuri", native: "মৈতৈলোন্", tts: false },
  { code: "brx-IN", name: "Bodo", native: "बड़ो", tts: false },
];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

export function canSpeak(code: string): boolean {
  return LANGUAGES.find((l) => l.code === code)?.tts ?? false;
}
