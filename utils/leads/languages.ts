/* Languages the calling agent can listen and speak in. `code` is used for Twilio speech
   recognition (<Gather language>) and `voice` for text-to-speech (<Say voice>).
   Add or swap voices here — see Twilio's TTS voice list for the full catalogue. */
export const LANGUAGES = [
  { code: "en-IN", label: "English (India)", voice: "Google.en-IN-Standard-A" },
  { code: "en-US", label: "English (US)", voice: "Google.en-US-Standard-C" },
  { code: "hi-IN", label: "Hindi", voice: "Google.hi-IN-Standard-A" },
  { code: "mr-IN", label: "Marathi", voice: "Google.mr-IN-Standard-A" },
  { code: "gu-IN", label: "Gujarati", voice: "Google.gu-IN-Standard-A" },
  { code: "ta-IN", label: "Tamil", voice: "Google.ta-IN-Standard-A" },
  { code: "te-IN", label: "Telugu", voice: "Google.te-IN-Standard-A" },
  { code: "kn-IN", label: "Kannada", voice: "Google.kn-IN-Standard-A" },
  { code: "ml-IN", label: "Malayalam", voice: "Google.ml-IN-Standard-A" },
  { code: "bn-IN", label: "Bengali", voice: "Google.bn-IN-Standard-A" },
  { code: "pa-IN", label: "Punjabi", voice: "Google.pa-IN-Standard-A" },
  { code: "ar-XA", label: "Arabic", voice: "Google.ar-XA-Standard-A" },
  { code: "es-ES", label: "Spanish", voice: "Google.es-ES-Standard-A" },
  { code: "fr-FR", label: "French", voice: "Google.fr-FR-Standard-A" },
  { code: "de-DE", label: "German", voice: "Google.de-DE-Standard-A" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export const languageInfo = (code: string | null | undefined) =>
  LANGUAGES.find((l) => l.code === code) ??
  LANGUAGES.find((l) => code && l.code.startsWith(code.split("-")[0] + "-")) ??
  LANGUAGES[0];
