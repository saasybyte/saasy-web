import { createSignal } from "solid-js";
import { AssistantService } from "../services/assistant";
import type { ProviderConfig } from "../types/assistant";

export type PageState = "locked" | "unlocked" | "active";

interface StartSessionOptions {
  llm: ProviderConfig;
  tts: ProviderConfig;
  stt: ProviderConfig;
}

const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const;

let countdownIntervalId: number | null = null;
let idleTimeoutId: number | null = null;

// Page state
const [pageState, setPageState] = createSignal<PageState>("locked");

// Invite code
const [inviteCode, setInviteCode] = createSignal("");

// JWT token (stored in memory only)
const [jwt, setJwt] = createSignal<string | null>(null);

// Validation state
const [validationError, setValidationError] = createSignal<string | null>(null);

// Provider selections (model IDs, empty until data loads)
const [selectedLlm, setSelectedLlm] = createSignal("");
const [selectedStt, setSelectedStt] = createSignal("");
const [selectedTts, setSelectedTts] = createSignal("");

// Session state
const [assistantService, setAssistantService] = createSignal<AssistantService | null>(null);
const [isConnecting, setIsConnecting] = createSignal(false);
const [sessionError, setSessionError] = createSignal<string | null>(null);
const [remoteStream, setRemoteStream] = createSignal<MediaStream | null>(null);
const [isMuted, setIsMuted] = createSignal(false);

// Usage tracking (countdown + toast)
const [showTwoMinWarning, setShowTwoMinWarning] = createSignal(false);
const [countdownSeconds, setCountdownSeconds] = createSignal<number | null>(null);

const clearIdleTimeout = () => {
  if (idleTimeoutId) {
    clearTimeout(idleTimeoutId);
    idleTimeoutId = null;
  }
};

const resetIdleTimer = () => {
  clearIdleTimeout();
  // Only run timer in "unlocked" state (has JWT, not in session)
  if (pageState() !== "unlocked") return;

  idleTimeoutId = window.setTimeout(() => {
    setJwt(null);
    setInviteCode("");
    setPageState("locked");
    stopIdleTimer();
  }, IDLE_TIMEOUT_MS);
};

const clearCountdown = () => {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
  setCountdownSeconds(null);
  setShowTwoMinWarning(false);
};

const startIdleTimer = () => {
  ACTIVITY_EVENTS.forEach((event) =>
    window.addEventListener(event, resetIdleTimer, { passive: true }),
  );
  resetIdleTimer();
};

const stopIdleTimer = () => {
  clearIdleTimeout();
  ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetIdleTimer));
};

// Validation handlers (called by mutation in component)
const onValidationSuccess = (token: string) => {
  setJwt(token);
  setPageState("unlocked");
  setValidationError(null);
  startIdleTimer();
};

const onValidationError = (error: string) => {
  setValidationError(error);
};

const clearValidationError = () => {
  setValidationError(null);
};

const startSession = async (providers: StartSessionOptions) => {
  const token = jwt();
  if (!token) {
    setSessionError("No authentication token");
    return;
  }

  setIsConnecting(true);
  setSessionError(null);
  clearIdleTimeout(); // Pause idle timer during session

  try {
    const service = new AssistantService(
      { assistant: { autoStartLocalMedia: true } },
      {
        onConnected: () => {
          setPageState("active");
        },
        onUsageStatus: (remainingSeconds) => {
          if (remainingSeconds <= 30) {
            // Start local countdown (no loop)
            setCountdownSeconds(remainingSeconds);
            if (!countdownIntervalId) {
              countdownIntervalId = window.setInterval(() => {
                setCountdownSeconds((prev) => {
                  if (prev !== null && prev > 0) return prev - 1;
                  if (countdownIntervalId) {
                    clearInterval(countdownIntervalId);
                    countdownIntervalId = null;
                  }
                  return null;
                });
              }, 1000);
            }
          } else if (remainingSeconds <= 120) {
            // Show 2 min toast (only if not already showing countdown)
            if (countdownSeconds() === null) {
              setShowTwoMinWarning(true);
              setTimeout(() => setShowTwoMinWarning(false), 6000);
            }
          }
        },
        onDisconnected: () => {
          clearCountdown();
          setPageState("unlocked");
          setRemoteStream(null);
          resetIdleTimer();
        },
        onError: (error) => {
          setSessionError(error.message);
        },
        onRemoteStream: (stream) => {
          setRemoteStream(stream);
        },
        onSessionEnded: (reason) => {
          clearCountdown();
          if (reason === "timeout") {
            setJwt(null);
            setSessionError("Your session timed out");
            setPageState("locked");
          } else if (reason === "error") {
            setJwt(null);
            setSessionError("Session ended unexpectedly. Please try again.");
            setPageState("locked");
          } else {
            setPageState("unlocked");
          }
          setRemoteStream(null);
          resetIdleTimer();
        },
      },
    );

    setAssistantService(service);

    const connected = await service.connect({
      authToken: token,
      providers,
    });

    if (!connected) {
      setSessionError("Failed to connect");
      setAssistantService(null);
    }
  } catch (err) {
    setSessionError(err instanceof Error ? err.message : "Connection failed");
    setAssistantService(null);
  } finally {
    setIsConnecting(false);
  }
};

const exitSession = async () => {
  const service = assistantService();
  if (service) {
    await service.disconnect();
    setAssistantService(null);
  }
  setRemoteStream(null);
  setIsMuted(false);
  clearCountdown();
  setPageState("unlocked");
  resetIdleTimer();
};

const toggleMute = () => {
  const service = assistantService();
  if (!service) return;
  const newMuted = !isMuted();
  service.setMicMuted(newMuted);
  setIsMuted(newMuted);
};

export {
  pageState,
  setPageState,
  inviteCode,
  setInviteCode,
  jwt,
  validationError,
  selectedLlm,
  setSelectedLlm,
  selectedStt,
  setSelectedStt,
  selectedTts,
  setSelectedTts,
  isConnecting,
  sessionError,
  remoteStream,
  isMuted,
  showTwoMinWarning,
  countdownSeconds,
  onValidationSuccess,
  onValidationError,
  clearValidationError,
  startSession,
  exitSession,
  toggleMute,
  startIdleTimer,
  stopIdleTimer,
};
