# saasy-web

Browser client for [SaasyByte](https://github.com/saasybyte/saasybyte), an open-source real-time AI voice platform.

A SolidJS single-page app: validate an invite code, pick your LLM, TTS, and STT providers, and hold a real-time voice conversation with the AI assistant over WebRTC (via mediasoup-client). Signaling runs over WebSocket using Proto3 binary envelopes.

## How It Fits

- **Calls saasy-core** (REST): invite code validation and JWT issuance.
- **Calls saasy-edge** (REST): the LLM/STT/TTS provider model catalog.
- **Calls saasy-signal** (WebSocket): session setup and WebRTC negotiation.
- **Proto types** come from [`@saasybyte/saasy-proto-ts`](https://github.com/saasybyte/saasy-proto-ts) (npm).

See the [platform overview](https://github.com/saasybyte/saasybyte) for the full architecture.

## Develop & Build

Requirements: [Bun](https://bun.sh/).

```bash
bun install
bun dev              # dev server on 0.0.0.0:5173
bun run build        # type-check + production bundle to dist/
bun run lint         # ESLint
bun run generate     # regenerate API clients from Core/Edge OpenAPI specs
```

Backend endpoints come from Vite env vars (`VITE_CORE_URL`, `VITE_EDGE_URL`, `VITE_SIGNAL_URL`); see `.env.example`. Dev defaults target a local stack.

## License

Apache-2.0, see [LICENSE](LICENSE).
