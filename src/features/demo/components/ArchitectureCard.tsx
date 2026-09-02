import { createSignal, onCleanup, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { X } from "lucide-solid";
import architectureDiagram from "../assets/architecture-diagram.svg?url";

export default function ArchitectureCard() {
  const [expanded, setExpanded] = createSignal(false);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") setExpanded(false);
  };

  // Register/cleanup keyboard listener when expanded
  const open = () => {
    setExpanded(true);
    document.addEventListener("keydown", onKeyDown);
  };

  const close = () => {
    setExpanded(false);
    document.removeEventListener("keydown", onKeyDown);
  };

  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <>
      <div
        class="cursor-pointer rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700 active:border-zinc-600 md:col-span-2 lg:col-span-3"
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") open();
        }}
      >
        <img
          src={architectureDiagram}
          alt="System Architecture — Control Plane, Media Plane, Intelligence Plane"
          class="w-full"
          loading="lazy"
          draggable={false}
        />
      </div>

      <Presence>
        <Show when={expanded()}>
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={close}
          >
            <button
              class="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
              onClick={close}
              aria-label="Close"
            >
              <X class="h-5 w-5" />
            </button>
            <Motion.img
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              src={architectureDiagram}
              alt="System Architecture — Control Plane, Media Plane, Intelligence Plane"
              class="max-h-[95dvh] max-w-[95dvw] object-contain"
              draggable={false}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            />
          </Motion.div>
        </Show>
      </Presence>
    </>
  );
}
