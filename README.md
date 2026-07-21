# EDR Behavior Explorer — Frontend

A Grafana-style operations console for the `edr-behavior-engine` backend.
Dark SOC theme, severity-driven color coding, and a process graph rendered
as a custom "circuit trace" diagram rather than a generic force layout.
<img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/da76caa5-4a6c-4114-8d5a-6b70be1d2f9f" />
https://www.youtube.com/watch?v=qL2Om9l4gpU&t=12s
## Quick start

This expects the backend (`edr-behavior-engine`) running on `:8787`.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api/* to http://localhost:8787
```

If your backend runs elsewhere:

```bash
EDR_API_PROXY_TARGET=http://my-host:9000 npm run dev
```

Production build:

```bash
npm run build     # outputs to dist/
npm run preview
```

For a real deployment, serve `dist/` from the same origin as the API (or
behind a reverse proxy that forwards `/api`) rather than relying on the Vite
dev proxy, which is dev-only.

## Pages

| Page | What it shows |
|---|---|
| **Overview** | KPI stat row, severity breakdown donut, detections-over-time timeline, recent detections feed |
| **Processes** | Live, sortable Process Explorer-style table: process, company name, description, PID/PPID, CPU%, working set, private bytes. Populated by `collectors/windows-collector.ps1` in the backend repo — see its README for setup |
| **Detections** | Full filterable table (host, min confidence) with expandable rows showing every signature/temporal/anomaly finding |
| **Process Graph** | Per-host process lineage as an orthogonal "circuit trace" diagram. Nodes glow by severity of any detection tied to that PID; click a node for command line, company, description, live CPU/memory, and linked detections |
| **Audit Log** | Hash-chain integrity status (live `verifyChain()` result) + recent ledger entries |
| **Training Chunks** | Every closed `BehaviorChunk` with its flat feature vector (now including CPU/memory stats), exportable to CSV |

## Design system

Dark operations-console theme, distinct from generic dashboard defaults:

- **Severity ramp** (`--sev-critical/high/medium/low`) is the primary
  data-encoding color channel — used consistently across badges, the donut,
  the timeline, and the process graph, never reused for anything else.
- **Typography**: Space Grotesk for panel titles/stat numbers, Inter for
  body text, JetBrains Mono for anything that's actually data (PIDs,
  hashes, command lines, timestamps) — mirrors how a SOC analyst
  distinguishes "label" from "evidence" at a glance.
- **Process graph** uses `d3-hierarchy` purely for layout math; rendering is
  hand-rolled SVG with right-angle "circuit trace" connectors instead of
  smooth curves, and only the path leading into a critical-severity node
  animates — motion is spent deliberately, not everywhere.

## Known limitations

- **No auth.** The backend has none either — this is a reference pair, not
  a hardened deployment. Put both behind your normal auth/reverse-proxy
  layer before exposing them anywhere real.
- **Polling, not streaming.** Each page polls on an interval (configurable
  in the topbar, default 5s) rather than using SSE/WebSockets. Swapping in
  a `GET /events/stream` SSE endpoint on the backend would be a clean
  upgrade and wouldn't require touching the page components — only
  `usePolling`.
- **Process graph assumes unique PIDs per host.** If a host reuses a PID
  after a process terminates (real OS behavior, not modeled in the demo
  backend), the graph would currently merge them into one node. Worth
  fixing alongside any real Sysmon/ETW integration, which typically gives
  you a stable per-process GUID to key on instead of a raw PID.
