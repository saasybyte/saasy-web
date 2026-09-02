import AssistantControls from "./AssistantControls";
import AssistantOverlay from "./AssistantOverlay";
import ArchitectureCard from "./ArchitectureCard";
import InfoCard from "./InfoCard";
import GithubIcon from "@/assets/github.svg?component-solid";

export default function DemoPage() {
  return (
    <div class="min-h-screen">
      <div class="mx-auto max-w-5xl px-4 md:px-6">
        <header class="flex items-center justify-between py-6">
          <div>
            <h1 class="text-xl font-semibold text-white md:text-2xl">SaasyByte</h1>
            <p class="text-sm text-zinc-500">Real-time AI voice platform</p>
          </div>
          <a
            href="https://github.com/saasybyte"
            target="_blank"
            rel="noopener noreferrer"
            class="text-zinc-400 transition-colors hover:text-white"
            aria-label="GitHub"
          >
            <GithubIcon class="h-6 w-6" />
          </a>
        </header>
        <AssistantControls />
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <InfoCard />
          <ArchitectureCard />
        </div>
      </div>
      <AssistantOverlay />
    </div>
  );
}
