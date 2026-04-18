# jarvis-plugin-canvas

Visual canvas for JARVIS — Mermaid diagrams and collaborative drawing in the HUD.

## Features

- **Mermaid tabs** — render flowcharts, sequence diagrams, class diagrams, state machines, ER diagrams, gantt charts, etc. directly from Mermaid syntax.
- **Drawing tabs** — a freehand SVG canvas where the user can sketch with the mouse/pen. Drawings can be sent back to JARVIS as PNG attachments for visual conversation.
- **AI-authored SVG** — the AI can seed a draw tab with shapes/paths, or append annotations to an existing tab.
- **Multi-tab** — every `canvas_mermaid` / `canvas_draw` call opens a new tab; user can switch between them.

## Capabilities

| Tool | Purpose |
|------|---------|
| `canvas_mermaid` | Open a tab with a Mermaid diagram. |
| `canvas_draw` | Open a blank (or seeded) drawing tab. |
| `canvas_add` | Append SVG to an existing draw tab. |
| `canvas_clear` | Clear one tab or all tabs. |

## HTTP Route

`POST /plugins/canvas/send` — the renderer POSTs here when the user hits "Send" on a drawing. Body:

```json
{ "tabId": "tab-3", "pngBase64": "...", "description": "optional" }
```

The plugin publishes an `ai.request` to `main` with the PNG attached, so the AI treats the drawing as a normal user turn.

## Structure

- `pieces/index.ts` — entry point, exports `createPieces`.
- `pieces/canvas.ts` — `CanvasPiece`: state, capabilities, HTTP route.
- `renderers/CanvasRenderer.tsx` — (separate task) the frontend that renders tabs, Mermaid, and the SVG drawing surface.
