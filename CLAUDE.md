# saasy-web

## Commands
- `bun install` — install dependencies
- `bun dev` — dev server (0.0.0.0)
- `bun run build` — tsc -b && vite build
- `bun run preview` — preview production build
- `bun run lint` / `bun run lint:fix` — ESLint check / auto-fix
- `bun run format` — Prettier format
- `bun run generate` — regenerate API clients from Edge/Core OpenAPI specs

No tests exist yet.

## Conventions
- **Path alias**: `@/` maps to `src/`
- **SVG imports**: Use `?component-solid` suffix for SolidJS components (e.g., `import Icon from "@/assets/icon.svg?component-solid"`)
- **Auto-generated files**: Never edit `*.gen.ts` files under `src/api/`; regenerate with `bun run generate`
- **State management**: Module-level `createSignal` exports in `stores/state.ts` — no context providers
- **Services**: Class-based with event callback objects passed to constructor (not hooks/signals)
- **Feature modules**: Self-contained under `features/<name>/` with barrel `index.tsx` re-exporting routes
- **Routing**: Lazy-loaded via `lazyRouteComponent(() => import(...))`

## Service Boundaries
- **Calls saasy-signal** (WebSocket): session setup and WebRTC negotiation via Proto3 binary envelopes.
- **Calls saasy-core** (REST): invite code validation, JWT issuance.
- **Calls saasy-edge** (REST): LLM/STT/TTS provider model catalog.
- **Proto types from @saasybyte/saasy-proto-ts** (npm dep): Do not define proto types locally.
- **Does not own**: signaling protocol (saasy-signal), auth/JWT issuance (saasy-core), usage tracking (saasy-core), model registry (saasy-edge), media forwarding (saasy-sfu).
