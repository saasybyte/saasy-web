export default function InfoCard() {
  return (
    <div class="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2 lg:col-span-3">
      <div class="space-y-4 leading-relaxed text-zinc-400">
        <p>
          This is a demo of SaasyByte, a real-time AI voice platform. Enter an invite code, pick
          your providers, and have a conversation with Anysia, the assistant. No
          pre-recorded responses, no scripted flows. Just you and an AI talking in real time.
        </p>
        <p>
          The system runs on a custom WebRTC media pipeline with dedicated signaling, media, and AI
          planes designed for low-latency voice interaction. It's built around a multi-provider
          architecture, so you can swap LLM, TTS, and STT providers on the fly.
        </p>
        <p>
          The entire platform is open source. If you want to know how it works under the hood, ask
          Anysia. She runs on it and knows it well. Or just talk to her about anything. She's good
          at that too.
        </p>
      </div>
    </div>
  );
}
