# Canvas Plugin

A visual canvas panel in the HUD with two tab types: **Mermaid diagrams** and **free-form drawing**.

## Tools

- `canvas_mermaid(syntax, title?)` — Open a new tab with a Mermaid diagram. `syntax` is the raw Mermaid source (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, pie, etc.). Use when the user asks for a diagram, architecture sketch, flow, or any structured visual.
- `canvas_draw(svg?, title?)` — Open a new blank drawing tab where the user can sketch. Optionally seed it with initial SVG content (paths, shapes, text) — useful for giving the user something to annotate.
- `canvas_add(tabId, svg)` — Append SVG elements to an existing draw tab. Use to add annotations, highlights, or pre-drawn shapes to a tab the user is already working on.
- `canvas_clear(tabId?)` — Clear a specific tab's content (keeps the tab open), or all tabs if `tabId` is omitted.

## Behavior

- Each call to `canvas_mermaid` or `canvas_draw` creates a new tab. Tab IDs are returned in the tool result — use them for follow-up `canvas_add` / `canvas_clear` calls.
- When the user sends a drawing from the canvas, it arrives as a `[SYSTEM]` user message with a PNG image attached. Treat it as a normal part of the conversation — acknowledge what you see, answer questions about it, or continue the task it relates to.
- Prefer Mermaid for anything structured (flows, hierarchies, sequences). Use draw tabs for freeform sketches, annotations, or when the user wants to collaborate visually.
- Keep diagrams focused. If the topic is large, split into multiple tabs rather than one giant diagram.
