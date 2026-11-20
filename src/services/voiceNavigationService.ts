import type { RouteStepInstruction, VoiceLanguage } from "../types/mobility";

export const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, { short: string; name: string; bcp47: string }> = {
  en: { short: "EN", name: "English", bcp47: "en-IN" },
  hi: { short: "हिं", name: "Hindi", bcp47: "hi-IN" },
  te: { short: "తె", name: "Telugu", bcp47: "te-IN" },
};

function formatDistancePhrase(distanceMeters: number, lang: VoiceLanguage): string {
  const m = Math.max(0, Math.round(distanceMeters));
  if (lang === "hi") {
    if (m >= 1000) {
      const km = (m / 1000).toFixed(1);
      return `${km} किलोमीटर में`;
    }
    const rounded = Math.max(20, Math.round(m / 10) * 10);
    return `${rounded} मीटर में`;
  }
  if (lang === "te") {
    if (m >= 1000) {
      const km = (m / 1000).toFixed(1);
      return `${km} కిలోమీటర్ల తర్వాత`;
    }
    const rounded = Math.max(20, Math.round(m / 10) * 10);
    return `${rounded} మీటర్ల తర్వాత`;
  }
  if (m >= 1000) {
    const km = (m / 1000).toFixed(1);
    return `In ${km} kilometers,`;
  }
  const rounded = Math.max(20, Math.round(m / 10) * 10);
  return `In ${rounded} meters,`;
}

function localizeManeuver(step: RouteStepInstruction, lang: VoiceLanguage): string {
  const road = step.roadName && step.roadName !== "Unnamed road" ? step.roadName : "";
  const mod = (step.modifier || "").toLowerCase();
  const type = (step.maneuverType || "").toLowerCase();

  if (lang === "en") {
    return step.instruction;
  }

  if (lang === "hi") {
    const onto = road ? ` ${road} पर` : "";
    if (type === "arrive") return "आप अपने गंतव्य पर पहुँच गए हैं";
    if (type === "depart") return road ? `${road} पर आगे बढ़ें` : "मार्ग पर आगे बढ़ें";
    if (type.includes("roundabout") || type === "rotary") {
      return step.exit
        ? `गोल चक्कर से ${step.exit} नंबर निकास लें${onto}`
        : `गोल चक्कर से आगे बढ़ें${onto}`;
    }
    if (type === "off ramp") return `बाहर निकलने का रास्ता लें${onto}`;
    if (type === "on ramp" || type === "merge") return `मुख्य मार्ग पर मिलें${onto}`;
    if (mod === "uturn") return `यू-टर्न लें${onto}`;
    if (mod.includes("left")) return `बाएँ मुड़ें${onto}`;
    if (mod.includes("right")) return `दाएँ मुड़ें${onto}`;
    return road ? `${road} पर सीधे चलते रहें` : "सीधे चलते रहें";
  }

  // Telugu ("te")
  const onto = road ? ` ${road} వైపు` : "";
  if (type === "arrive") return "మీరు మీ గమ్యస్థానానికి చేరుకున్నారు";
  if (type === "depart") return road ? `${road} లో ముందుకు వెళ్ళండి` : "మార్గంలో ముందుకు వెళ్ళండి";
  if (type.includes("roundabout") || type === "rotary") {
    return step.exit
      ? `రౌండ్ అబౌట్ వద్ద ${step.exit}వ ఎగ్జిట్ తీసుకోండి${onto}`
      : `రౌండ్ అబౌట్ గుండా ముందుకు వెళ్ళండి${onto}`;
  }
  if (type === "off ramp") return `ఎగ్జిట్ తీసుకోండి${onto}`;
  if (type === "on ramp" || type === "merge") return `ప్రధాన రహదారిలో కలవండి${onto}`;
  if (mod === "uturn") return `యూ-టర్న్ తీసుకోండి${onto}`;
  if (mod.includes("left")) return `ఎడమవైపు తిరగండి${onto}`;
  if (mod.includes("right")) return `కుడివైపు తిరగండి${onto}`;
  return road ? `${road} లో నేరుగా వెళ్ళండి` : "నేరుగా వెళ్ళండి";
}

export function formatTurnAnnouncement(
  step: RouteStepInstruction,
  distanceMeters: number,
  lang: VoiceLanguage,
): string {
  const action = localizeManeuver(step, lang);
  if (step.maneuverType === "arrive" && distanceMeters <= 60) {
    return action;
  }
  if (distanceMeters <= 45) {
    if (lang === "hi") return `अब ${action}`;
    if (lang === "te") return `ఇప్పుడు ${action}`;
    return `Now, ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
  }
  const dist = formatDistancePhrase(distanceMeters, lang);
  if (lang === "en") {
    return `${dist} ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
  }
  return `${dist} ${action}`;
}

export function formatNavigationEvent(
  eventType: "start" | "off_route" | "rerouted" | "arrived",
  data: {
    destinationName?: string;
    remainingKm?: number;
    remainingMin?: number;
    isPreview?: boolean;
  },
  lang: VoiceLanguage,
): string {
  const dest = data.destinationName || "your destination";
  const km = (data.remainingKm ?? 0).toFixed(1);
  const min = Math.max(1, Math.round(data.remainingMin ?? 1));

  if (lang === "hi") {
    switch (eventType) {
      case "start":
        return `${data.isPreview ? "रूट प्रीव्यू शुरू हो रहा है। " : ""}${dest} के लिए नेविगेशन शुरू। शेष दूरी ${km} किलोमीटर, अनुमानित समय ${min} मिनट।`;
      case "off_route":
        return "आप मार्ग से हट गए हैं। नया रास्ता खोजा जा रहा है।";
      case "rerouted":
        return `नया मार्ग तैयार है। शेष दूरी ${km} किलोमीटर, अनुमानित समय ${min} मिनट।`;
      case "arrived":
        return `आप ${dest} पर पहुँच गए हैं।`;
    }
  }

  if (lang === "te") {
    switch (eventType) {
      case "start":
        return `${data.isPreview ? "రూట్ ప్రివ్యూ ప్రారంభమైంది. " : ""}${dest} కు నావిగేషన్ ప్రారంభమైంది. దూరం ${km} కిలోమీటర్లు, అంచనా సమయం ${min} నిమిషాలు.`;
      case "off_route":
        return "మీరు మార్గం నుండి పక్కకు వెళ్ళారు. కొత్త మార్గాన్ని లెక్కిస్తున్నాము.";
      case "rerouted":
        return `కొత్త మార్గం సిద్ధమైంది. మిగిలిన దూరం ${km} కిలోమీటర్లు, అంచనా సమయం ${min} నిమిషాలు.`;
      case "arrived":
        return `మీరు ${dest} చేరుకున్నారు.`;
    }
  }

  // English
  switch (eventType) {
    case "start":
      return `${data.isPreview ? "Starting simulated route preview. " : ""}Starting navigation to ${dest}. Remaining distance ${km} kilometers, estimated time ${min} minutes.`;
    case "off_route":
      return "You are off route. Recalculating directions.";
    case "rerouted":
      return `Route updated. Remaining distance ${km} kilometers, estimated time ${min} minutes.`;
    case "arrived":
      return `You have arrived at ${dest}.`;
  }
}

export function pickSpeechVoice(lang: VoiceLanguage): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const preferredPrefixes =
    lang === "te"
      ? ["te-in", "te"]
      : lang === "hi"
        ? ["hi-in", "hi"]
        : ["en-in", "en-us", "en-gb", "en"];

  for (const prefix of preferredPrefixes) {
    const exact = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (exact) return exact;
  }

  // Fallback to any English or default voice
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) || voices[0] || null;
}

export function getInstalledVoiceAvailability(): Record<VoiceLanguage, boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { en: false, hi: false, te: false };
  }
  const voices = window.speechSynthesis.getVoices();
  return {
    en: voices.some((v) => v.lang.toLowerCase().startsWith("en")),
    hi: voices.some((v) => v.lang.toLowerCase().startsWith("hi")),
    te: voices.some((v) => v.lang.toLowerCase().startsWith("te")),
  };
}

export function stopSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore speech cancel errors
  }
}

export function speakNavigationText(
  text: string,
  lang: VoiceLanguage,
  enabled: boolean,
  urgent = false,
): boolean {
  if (!enabled || !text.trim()) return false;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;

  try {
    if (urgent || window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickSpeechVoice(lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = VOICE_LANGUAGE_LABELS[lang].bcp47;
    }
    utterance.rate = lang === "en" ? 1.02 : 0.96;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
