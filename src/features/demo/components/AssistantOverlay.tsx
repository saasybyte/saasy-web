import { Motion, Presence } from "solid-motionone";
import { ArrowLeft, Mic, MicOff } from "lucide-solid";
import { createEffect, For, Show } from "solid-js";
import {
  pageState,
  exitSession,
  remoteStream,
  isMuted,
  toggleMute,
  showTwoMinWarning,
  countdownSeconds,
} from "../stores/state";
import { logger } from "@/utils/logger";

function Waveform() {
  // Create bars for the waveform visualization
  const bars = Array.from({ length: 32 }, (_, i) => i);

  return (
    <div class="flex h-16 items-center justify-center gap-1">
      <For each={bars}>
        {(_, index) => (
          <Motion
            animate={{
              scaleY: [0.3, 1, 0.3],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: index() * 0.05,
              easing: "ease-in-out",
            }}
            class="h-full w-1 origin-center rounded-full bg-white"
            style={{ height: "100%" }}
          />
        )}
      </For>
    </div>
  );
}

export default function AssistantOverlay() {
  let audioRef: HTMLAudioElement | undefined;

  // Wire up remote audio stream when available
  createEffect(() => {
    const isActive = pageState() === "active";
    const stream = remoteStream();
    if (audioRef && isActive && stream) {
      audioRef.srcObject = stream;
      audioRef.play().catch((err) => logger.error("Audio play failed:", err));
    } else if (audioRef) {
      audioRef.srcObject = null;
    }
  });

  return (
    <Presence>
      <Show when={pageState() === "active"}>
        <Motion
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          class="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-md"
        >
          {/* Top Bar - Back Arrow (left), Toast (center), Countdown (right) */}
          <div class="flex items-center justify-between p-6">
            {/* Back Arrow */}
            <button
              onClick={exitSession}
              class="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-all hover:bg-zinc-300 hover:scale-105 active:scale-[0.98]"
              aria-label="Exit session"
            >
              <ArrowLeft class="h-5 w-5" />
            </button>

            {/* Toast - 2 min warning */}
            <Presence>
              <Show when={showTwoMinWarning()}>
                <Motion
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  class="rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
                >
                  2 minutes remaining
                </Motion>
              </Show>
            </Presence>

            {/* Countdown */}
            <Show when={countdownSeconds() !== null} fallback={<div class="h-12 w-12" />}>
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-medium text-black">
                {countdownSeconds()}
              </div>
            </Show>
          </div>

          {/* Waveform - Center */}
          <div class="flex flex-1 items-center justify-center">
            <div class="w-80">
              <Waveform />
            </div>
          </div>

          {/* Mic Button - Bottom Center */}
          <div class="flex justify-center pb-12">
            <button
              onClick={toggleMute}
              class="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-all hover:bg-zinc-300 hover:scale-105 active:scale-[0.98]"
              aria-label={isMuted() ? "Unmute microphone" : "Mute microphone"}
            >
              <Show when={isMuted()} fallback={<Mic class="h-6 w-6" />}>
                <MicOff class="h-6 w-6" />
              </Show>
            </button>
          </div>

          {/* Hidden audio element for remote stream playback */}
          <audio ref={audioRef} autoplay class="hidden" />
        </Motion>
      </Show>
    </Presence>
  );
}
