# jarvis-plugin-canvas

Visual canvas plugin for JARVIS — Mermaid diagrams and collaborative freehand drawing in the HUD.

## Features

- **Mermaid diagrams** — flowcharts, sequence diagrams, class diagrams, state machines, ER diagrams, gantt charts, pie charts, and more. AI sends syntax, frontend renders with dark theme.
- **Freehand drawing** — infinite SVG canvas with smooth pressure-sensitive strokes via [perfect-freehand](https://github.com/steveruizok/perfect-freehand). Pan/zoom, color picker, eraser.
- **Text tool** — click anywhere to place text labels on the canvas.
- **AI ↔ User collaboration** — AI draws SVG elements programmatically, user annotates on top with freehand/text, then sends the result back as a PNG image for the AI to see.
- **Multi-tab** — each `canvas_mermaid` / `canvas_draw` call opens a new tab with independent state.
- **Send to JARVIS** — one-click SVG→PNG export sent as an image attachment to the AI conversation.

## Tools

| Tool | Description |
|------|-------------|
| `canvas_mermaid(syntax, title?)` | Open a new tab with a Mermaid diagram |
| `canvas_draw(svg?, title?)` | Open a blank drawing tab, optionally seeded with SVG |
| `canvas_add(tabId, svg)` | Append SVG elements to an existing draw tab |
| `canvas_clear(tabId?)` | Clear one tab's content or remove all tabs |

## HTTP Route

`POST /plugins/canvas/send` — the renderer calls this when the user clicks "Send to JARVIS".

```json
{ "tabId": "tab-1", "pngBase64": "iVBOR...", "description": "optional" }
```

Publishes an `ai.request` to the main session with the PNG as an image attachment.

## Structure

```
jarvis-plugin-canvas/
├── plugin.json              # manifest
├── context.md               # system prompt instructions
├── package.json             # deps: mermaid, perfect-freehand
├── pieces/
│   ├── index.ts             # entry point
│   └── canvas.ts            # CanvasPiece: state, tools, HTTP route
└── renderers/
    └── CanvasRenderer.tsx   # tabs, mermaid rendering, SVG draw canvas
```

## Install

Already installed locally at `~/.jarvis/plugins/jarvis-plugin-canvas/`.

To install from GitHub:
```
plugin_install github.com/giovanibarili/jarvis-plugin-canvas
```

## Dependencies

- `mermaid` ^11.4 — diagram rendering
- `perfect-freehand` ^1.2 — smooth freehand stroke outlines
