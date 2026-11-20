import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  Plus,
  Send,
  Siren,
  Sparkles,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "../../lib/convexAdapter";
import { api } from "../../../convex/_generated/api";
import { apiAskCompanion } from "../../services/apiClient";
import type {
  AgentToolTrace,
  CommunityReport,
  CompanionMapAction,
  LiveNavigationSnapshot,
  LiveTrafficSnapshot,
  PredictiveRouteResult,
  UserPreferencesRecord,
} from "../../types/mobility";

interface EnrichedReplyMeta {
  agentsUsed: string[];
  toolTraces: AgentToolTrace[];
  mapActions: CompanionMapAction[];
  modelUsed?: string;
}

interface DrivingCompanionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoute: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  communityReports: CommunityReport[];
  preferences: UserPreferencesRecord | null;
  userLocation: { lat: number; lng: number } | null;
  liveNavigation?: LiveNavigationSnapshot | null;
  liveTraffic?: LiveTrafficSnapshot | null;
  onExecuteMapAction: (action: CompanionMapAction) => void;
  pendingPrompt?: string | null;
  onConsumePendingPrompt?: () => void;
}

const QUICK_PROMPTS = [
  "How far is my destination and what is my estimated arrival time?",
  "When is my next turn and am I on the correct route?",
  "What places and stops are nearby my destination?",
  "Compare fastest vs lowest turn complexity on my active route",
  "Check road safety, community reports, and weather on my route",
  "Find nearby hospitals and compute an emergency route",
];

export function DrivingCompanionDrawer({
  isOpen,
  onClose,
  activeRoute,
  selectedRouteId,
  communityReports,
  preferences,
  userLocation,
  liveNavigation,
  liveTraffic,
  onExecuteMapAction,
  pendingPrompt,
  onConsumePendingPrompt,
}: DrivingCompanionDrawerProps) {
  const chatSession = useQuery(api.chat.getChatSession);
  const sendMessageMutation = useMutation(api.chat.sendMessage);
  const addBotResponseMutation = useMutation(api.chat.addBotResponse);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [replyMetaByIndex, setReplyMetaByIndex] = useState<
    Record<number, EnrichedReplyMeta>
  >({});
  const [isListening, setIsListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const sendingRef = useRef(false);

  const messages = chatSession?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isSending, isOpen]);

  const speakText = (text: string) => {
    if (!speakReplies || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, "").slice(0, 600));
      utterance.rate = 1.03;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore speech synthesis restrictions
    }
  };

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || sendingRef.current) return;

    sendingRef.current = true;
    setIsSending(true);
    setServiceError(null);
    if (!promptText) setInput("");

    try {
      const history = messages.slice(-8).map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }));

      const sessionId = await sendMessageMutation({ message: text });
      const expectedAssistantIndex = messages.length + 1;

      const response = await apiAskCompanion({
        message: text,
        activeRoute,
        selectedRouteId,
        communityReports,
        preferences,
        userLocation,
        liveNavigation,
        liveTraffic,
        history,
      });

      if (response.error && !response.reply) {
        setServiceError(response.error);
        toast.error(response.error);
        return;
      }

      const finalReply =
        response.reply ||
        response.error ||
        "The AI Driving Companion did not return a response.";

      if (sessionId) {
        await addBotResponseMutation({
          sessionId,
          response: finalReply,
        });
      }

      setReplyMetaByIndex((prev) => ({
        ...prev,
        [expectedAssistantIndex]: {
          agentsUsed: response.agentsUsed || [],
          toolTraces: response.toolTraces || [],
          mapActions: response.mapActions || [],
          modelUsed: response.modelUsed,
        },
      }));

      speakText(finalReply);
    } catch (err: any) {
      const msg = err?.message || "Failed to contact the AI Driving Companion.";
      setServiceError(msg);
      toast.error(msg);
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (isOpen && pendingPrompt && !sendingRef.current) {
      const prompt = pendingPrompt;
      onConsumePendingPrompt?.();
      void handleSend(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingPrompt]);

  const toggleVoiceInput = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error("Voice recognition is not supported in this browser.");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error("Could not capture voice input. Check microphone permissions.");
    };
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setInput(transcript);
        void handleSend(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-[1100] w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
      role="dialog"
      aria-label="AI Driving Companion"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
              AI Driving Companion
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Multi-agent Gemini tools · OSRM · OSM · Open-Meteo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              const next = !speakReplies;
              setSpeakReplies(next);
              if (!next && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
              }
            }}
            title={speakReplies ? "Mute voice read-back" : "Enable voice read-back"}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              speakReplies
                ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {speakReplies ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Driving Companion"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Safe Driving Guidance Bar */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2">
        <span>Safe driving: Review routes while parked or use voice controls.</span>
      </div>

      {/* Honest Server / Missing Key Error Banner */}
      {serviceError && (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold">Gemini Companion Unavailable</p>
            <p className="mt-0.5 leading-relaxed">{serviceError}</p>
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Tool-Powered Multi-Agent Mobility Assistant
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Ask me to plan real OSRM routes, explain turn complexity, discover OpenStreetMap parking or EV stops, inspect weather and community reports, or locate nearby hospitals.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Suggested Agent Actions
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void handleSend(q)}
                    disabled={isSending}
                    className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          const meta = replyMetaByIndex[idx];
          return (
            <div
              key={`${msg.timestamp}_${idx}`}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {msg.content}
              </div>

              {/* Agent & Tool Execution Traces */}
              {!isUser && meta && meta.toolTraces.length > 0 && (
                <div className="mt-2 max-w-[92%] w-full space-y-1.5">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" />
                    <span>
                      Executed via {meta.agentsUsed.join(" · ") || "Agent Tools"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {meta.toolTraces.map((trace, tIdx) => (
                      <div
                        key={`${trace.toolName}_${tIdx}`}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5"
                      >
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            trace.status === "success"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-500"
                          }`}
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {trace.agent}:
                          </span>{" "}
                          <span>{trace.summary}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Map & Route Action Triggers */}
              {!isUser && meta && meta.mapActions.length > 0 && (
                <div className="mt-2 max-w-[92%] flex flex-wrap gap-1.5">
                  {meta.mapActions.map((action, aIdx) => (
                    <button
                      key={`${action.type}_${aIdx}`}
                      type="button"
                      onClick={() => onExecuteMapAction(action)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                        action.type === "apply_emergency_route"
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : action.type === "apply_route"
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90"
                      }`}
                    >
                      {action.type === "apply_emergency_route" ? (
                        <Siren className="w-3.5 h-3.5" />
                      ) : action.type === "apply_route" ? (
                        <Navigation className="w-3.5 h-3.5" />
                      ) : action.type === "add_stop" ? (
                        <Plus className="w-3.5 h-3.5" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5" />
                      )}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            Running mobility tools and synthesizing response...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleVoiceInput}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
              isListening
                ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about routes, stops, safety, or emergencies..."
            disabled={isSending}
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
          />

          <button
            type="submit"
            disabled={isSending || !input.trim()}
            aria-label="Send message"
            className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shrink-0 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
