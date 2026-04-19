# jarvis-plugin-canvas — Functional Tests

> BDD scenarios for validating the Canvas plugin end-to-end.
> Execute these after any code change, plugin update, or JARVIS core upgrade.

## Feature: Mermaid Diagrams

### Scenario: Create a Mermaid diagram tab

```gherkin
Given the plugin is installed and enabled
When I call canvas_mermaid with syntax "flowchart TD\n  A-->B" and title "Test Flow"
Then the result should be success: true with a tabId (e.g. "tab-N")
And the result should include title "Test Flow" and type "mermaid"
And the Canvas panel should appear in the HUD with a tab bar showing "Test Flow"
```

### Scenario: Create a Mermaid diagram with default title

```gherkin
Given no canvas tabs exist
When I call canvas_mermaid with syntax "pie\n  title Pets\n  \"Dogs\" : 40\n  \"Cats\" : 30" and no title
Then the result should be success: true
And the title should default to "Diagram N" (where N is the tab counter)
```

### Scenario: Create multiple Mermaid diagrams

```gherkin
Given one Mermaid tab already exists
When I call canvas_mermaid again with different syntax
Then a new tab should be created with a different tabId
And both tabs should appear in the Canvas panel tab bar
And the newest tab should be auto-activated
```

### Scenario: Empty syntax is rejected

```gherkin
When I call canvas_mermaid with syntax "" (empty string)
Then the result should be success: false
And the error should be "syntax is required"
And no tab should be created
```

### Scenario: Various diagram types render

```gherkin
Given the Canvas panel is visible
When I create diagrams with different types:
  - flowchart TD
  - sequenceDiagram
  - classDiagram
  - erDiagram
  - pie
Then each should return success: true with a unique tabId
And each should create a separate tab in the panel
```

## Feature: Drawing Tabs

### Scenario: Create a blank drawing tab

```gherkin
When I call canvas_draw with no arguments
Then the result should be success: true with a tabId
And the result should include type "draw"
And the title should default to "Sketch N"
And the Canvas panel should show a drawing tab with toolbar (pencil, text, eraser, pan, color, clear, send)
```

### Scenario: Create a drawing tab with initial SVG

```gherkin
When I call canvas_draw with svg "<circle cx='100' cy='100' r='50' fill='red'/>" and title "My Sketch"
Then the result should be success: true
And the title should be "My Sketch"
And the tab content should contain the provided SVG
```

### Scenario: Create a drawing tab with custom title

```gherkin
When I call canvas_draw with title "Architecture Sketch"
Then the result should be success: true
And the title should be "Architecture Sketch"
```

## Feature: Append SVG to Draw Tab

### Scenario: Append SVG to an existing draw tab

```gherkin
Given a draw tab exists with tabId "tab-X"
When I call canvas_add with tabId "tab-X" and svg "<rect x='0' y='0' width='50' height='50' fill='blue'/>"
Then the result should be success: true
And the result should include the tabId and contentLength > 0
And the tab content should now contain the appended SVG
```

### Scenario: canvas_add on a non-existent tab

```gherkin
When I call canvas_add with tabId "tab-999" and svg "<circle/>"
Then the result should be success: false
And the error should be "Tab tab-999 not found"
```

### Scenario: canvas_add on a mermaid tab is rejected

```gherkin
Given a mermaid tab exists with tabId "tab-X"
When I call canvas_add with tabId "tab-X" and svg "<rect/>"
Then the result should be success: false
And the error should contain "only works on draw tabs"
```

### Scenario: Multiple appends accumulate content

```gherkin
Given a draw tab exists with tabId "tab-X" and empty content
When I call canvas_add with svg "<circle r='10'/>"
And then call canvas_add again with svg "<rect width='20' height='20'/>"
Then the tab content should contain both SVG elements
And the contentLength should increase with each append
```

## Feature: Clear Canvas

### Scenario: Clear a specific tab's content

```gherkin
Given a draw tab exists with tabId "tab-X" and non-empty content
When I call canvas_clear with tabId "tab-X"
Then the result should be success: true with cleared "content"
And the tab should still exist but its content should be empty
```

### Scenario: Clear all tabs

```gherkin
Given multiple tabs exist (both mermaid and draw)
When I call canvas_clear with no tabId
Then the result should be success: true with cleared "all"
And the result should include removed count matching the number of tabs
And the Canvas panel should show no tabs
```

### Scenario: Clear a non-existent tab

```gherkin
When I call canvas_clear with tabId "tab-999"
Then the result should be success: false
And the error should be "Tab tab-999 not found"
```

## Feature: HTTP Route — Send Drawing

> **NOTE:** All tests use a valid 1x1 PNG base64 string. Truncated PNG data (e.g. just the header)
> is rejected by the server to prevent poisoning the AI conversation history with unprocessable images.
> Valid test PNG: `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=`

### Scenario: Send drawing via HTTP POST

```gherkin
Given the plugin is running
When I POST to /plugins/canvas/send with body {"tabId": "tab-1", "pngBase64": "<VALID_PNG_B64>"}
Then the response should be {"success": true, "tabId": "tab-1"}
And a message should be published on ai.request channel to "main" with:
  - text containing "[SYSTEM] User sent drawing from canvas tab"
  - an attached image with mediaType "image/png"
```

**Validation command:**
```
bash: curl -s -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "test-send", "pngBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="}'
→ should return {"success": true, "tabId": "test-send"}
```

### Scenario: Send drawing with description

```gherkin
Given the plugin is running
When I POST to /plugins/canvas/send with body {"tabId": "tab-1", "pngBase64": "<VALID_PNG_B64>", "description": "architecture diagram"}
Then the response should be {"success": true, "tabId": "tab-1"}
And the published text should contain: [SYSTEM] User sent drawing from canvas tab "tab-1": architecture diagram
```

**Validation command:**
```
1. Subscribe to ai.request on the bus via jarvis_eval to capture the message:
   jarvis_eval: let captured = null;
     const unsub = bus.subscribe('ai.request', msg => { if (msg.source === 'canvas') captured = msg; });
     return 'listening';
2. bash: curl -s -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "desc-test", "pngBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "description": "my architecture diagram"}'
3. jarvis_eval: return JSON.stringify({ text: captured?.text, hasImages: !!captured?.images?.length, mediaType: captured?.images?.[0]?.mediaType });
   → text should contain '[SYSTEM] User sent drawing from canvas tab "desc-test": my architecture diagram'
   → hasImages should be true
   → mediaType should be "image/png"
4. jarvis_eval: unsub(); return 'cleaned up';
```

### Scenario: Send drawing arrives in main session as [SYSTEM] message

```gherkin
Given a draw tab exists
When the user clicks "Send to JARVIS" in the Canvas renderer (simulated via HTTP POST)
Then the main session should receive a user message with:
  - text starting with "[SYSTEM] User sent drawing from canvas tab"
  - an image attachment (PNG)
And the AI should be able to see and respond to the image
```

**Validation command:**
```
1. canvas_draw(title="Send Test") → get tabId
2. bash: curl -s -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "<tabId>", "pngBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="}'
   → {"success": true}
3. The main session should receive a [SYSTEM] message (may appear as a user message in the conversation)
```

### Scenario: Send drawing with missing fields

```gherkin
When I POST to /plugins/canvas/send with body {"tabId": ""}
Then the response should be HTTP 400
And the error should be "tabId and pngBase64 are required"
```

**Validation command:**
```
bash: curl -s -w "\n%{http_code}" -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": ""}'
→ body: {"error":"tabId and pngBase64 are required"}
→ HTTP status: 400
```

### Scenario: Send drawing with missing pngBase64

```gherkin
When I POST to /plugins/canvas/send with body {"tabId": "tab-1"}
Then the response should be HTTP 400
And the error should be "tabId and pngBase64 are required"
```

### Scenario: Send drawing with truncated/invalid PNG is rejected

```gherkin
When I POST to /plugins/canvas/send with body {"tabId": "tab-1", "pngBase64": "iVBORw0KGgo="}
Then the response should be HTTP 400
And the error should contain "Invalid PNG image"
```

**Validation command:**
```
bash: curl -s -w "\n%{http_code}" -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "tab-1", "pngBase64": "iVBORw0KGgo="}'
→ body: {"error":"Invalid PNG image: ..."}
→ HTTP status: 400
```

### Scenario: Send drawing with non-PNG base64 is rejected

```gherkin
When I POST to /plugins/canvas/send with body {"tabId": "tab-1", "pngBase64": "SGVsbG8gV29ybGQh"}
Then the response should be HTTP 400
And the error should contain "Invalid PNG image"
```

**Validation command:**
```
bash: curl -s -w "\n%{http_code}" -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "tab-1", "pngBase64": "SGVsbG8gV29ybGQh"}'
→ body: {"error":"Invalid PNG image: ..."}
→ HTTP status: 400
```

### Scenario: Send drawing strips data URL prefix

```gherkin
When I POST to /plugins/canvas/send with body {"tabId": "tab-1", "pngBase64": "data:image/png;base64,<VALID_PNG_B64>"}
Then the response should be {"success": true}
And the base64 in the published image should NOT contain the "data:image/png;base64," prefix
```

**Validation command:**
```
1. jarvis_eval: let captured = null;
     const unsub = bus.subscribe('ai.request', msg => { if (msg.source === 'canvas') captured = msg; });
     return 'listening';
2. bash: curl -s -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "strip-test", "pngBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="}'
3. jarvis_eval: const b64 = captured?.images?.[0]?.base64; unsub(); return JSON.stringify({ startsWithData: b64?.startsWith('data:'), b64Length: b64?.length });
   → startsWithData should be false
   → b64Length should be 92 (the valid PNG without prefix)
```

## Feature: HUD Panel

### Scenario: Canvas panel appears when first tab is created

```gherkin
Given no canvas tabs exist and the Canvas panel is not visible
When I create the first tab via canvas_mermaid or canvas_draw
Then the Canvas panel should appear in the HUD
And it should use the CanvasRenderer from the plugin
And it should be sized 900x650 at position (100, 100)
```

### Scenario: Panel updates reflect in HUD via SSE

```gherkin
Given the Canvas panel is visible with one tab
When I create a second tab
Then the HUD should update to show both tabs in the tab bar without page refresh
And the new tab should be auto-selected (active)
```

### Scenario: Panel renders with correct renderer

```gherkin
Given the plugin is installed
When the Canvas panel is published to the HUD
Then it should reference renderer { plugin: "jarvis-plugin-canvas", file: "CanvasRenderer" }
And GET /plugins/jarvis-plugin-canvas/renderers/CanvasRenderer.js should return compiled JavaScript
```

**Validation command:**
```
bash: curl -s -o /dev/null -w "%{http_code}" http://localhost:50052/plugins/jarvis-plugin-canvas/renderers/CanvasRenderer.js
→ should return 200
```

## Feature: Tab Lifecycle

### Scenario: Tab IDs are sequential and unique

```gherkin
When I create tabs via canvas_mermaid and canvas_draw in any order
Then each tab should receive a unique sequential ID (tab-1, tab-2, tab-3, ...)
And no two tabs should share the same ID
```

### Scenario: historyCount increments on every state change

```gherkin
Given the Canvas panel data includes historyCount
When I create a tab, add SVG, or clear
Then historyCount should increment by 1 for each operation
And the renderer uses this to detect state changes
```

## Feature: Error Handling

### Scenario: Plugin renderer compilation

```gherkin
Given the plugin is installed
When the HUD requests /plugins/jarvis-plugin-canvas/renderers/CanvasRenderer.js
Then the server should return compiled JavaScript (HTTP 200)
And the response should contain the CanvasRenderer function
And other HUD panels should continue rendering normally
```

### Scenario: Invalid JSON in HTTP route

```gherkin
When I POST to /plugins/canvas/send with an invalid JSON body
Then the response should be HTTP 500
And the error message should describe the parse failure
And the plugin should continue working for subsequent requests
```

## Execution Checklist

Run these commands in order to validate the full lifecycle:

```
1. canvas_mermaid(syntax="flowchart TD\n  A-->B\n  B-->C", title="Test Flow")
   → Verify: success=true, tabId returned, title="Test Flow", type="mermaid"

2. canvas_mermaid(syntax="sequenceDiagram\n  Alice->>Bob: Hello")
   → Verify: success=true, different tabId, default title "Diagram N"

3. canvas_draw(title="My Sketch")
   → Verify: success=true, tabId returned, title="My Sketch", type="draw"

4. canvas_draw(svg="<circle cx='50' cy='50' r='30' fill='cyan'/>")
   → Verify: success=true, content contains the SVG

5. canvas_add(tabId=<draw-tab-id>, svg="<rect x='10' y='10' width='40' height='40' fill='red'/>")
   → Verify: success=true, contentLength > 0

6. canvas_add(tabId="tab-999", svg="<circle/>")
   → Verify: success=false, "Tab tab-999 not found"

7. canvas_add(tabId=<mermaid-tab-id>, svg="<rect/>")
   → Verify: success=false, "only works on draw tabs"

8. canvas_mermaid(syntax="")
   → Verify: success=false, "syntax is required"

9. canvas_clear(tabId=<draw-tab-id>)
   → Verify: success=true, cleared="content"

10. canvas_clear()
    → Verify: success=true, cleared="all", removed=N (all tabs gone)

11. hud_screenshot()
    → Verify: Canvas panel visible (or hidden if all tabs cleared)

12. bash: curl -s -o /dev/null -w "%{http_code}" http://localhost:50052/plugins/jarvis-plugin-canvas/renderers/CanvasRenderer.js
    → Verify: HTTP 200

13. bash: curl -s -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "", "pngBase64": ""}'
    → Verify: HTTP 400, "tabId and pngBase64 are required"

14. bash: curl -s -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "test", "pngBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="}'
    → Verify: {"success": true, "tabId": "test"}

15. Send with description:
    bash: curl -s -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "desc", "pngBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "description": "test diagram"}'
    → Verify: {"success": true, "tabId": "desc"}

16. Send with data URL prefix (should be stripped):
    jarvis_eval to subscribe → curl with "data:image/png;base64,<VALID_PNG>..." prefix → jarvis_eval to verify base64 doesn't start with "data:"

17. Send with missing pngBase64:
    bash: curl -s -w "\n%{http_code}" -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "x"}'
    → Verify: HTTP 400

18. Send with truncated PNG (should be rejected):
    bash: curl -s -w "\n%{http_code}" -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "x", "pngBase64": "iVBORw0KGgo="}'
    → Verify: HTTP 400, "Invalid PNG image"

19. Send with non-PNG base64 (should be rejected):
    bash: curl -s -w "\n%{http_code}" -X POST http://localhost:50052/plugins/canvas/send -H 'Content-Type: application/json' -d '{"tabId": "x", "pngBase64": "SGVsbG8gV29ybGQh"}'
    → Verify: HTTP 400, "Invalid PNG image"
```
