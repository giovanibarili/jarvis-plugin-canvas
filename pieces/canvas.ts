// pieces/canvas.ts
// CanvasPiece — maintains tabs (mermaid/draw) and publishes to hud.update
// for the CanvasRenderer. Registers canvas_* capabilities and an HTTP
// route for the renderer to POST drawings back into the conversation.

import type {
  Piece,
  PluginContext,
  EventBus,
  RouteHandler,
} from "@jarvis/core";
import type { IncomingMessage, ServerResponse } from "node:http";

type TabType = "mermaid" | "draw";

interface CanvasTab {
  id: string;
  type: TabType;
  title: string;
  content: string;
}

interface CanvasData {
  tabs: CanvasTab[];
  historyCount: number;
  [key: string]: unknown;
}

export class CanvasPiece implements Piece {
  readonly id = "canvas";
  readonly name = "Canvas";

  private bus!: EventBus;
  private ctx: PluginContext;

  private tabs: CanvasTab[] = [];
  private tabIdCounter = 0;
  private historyCount = 0;
  private addedToHud = false;

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
  }

  async start(bus: EventBus): Promise<void> {
    this.bus = bus;
    this.registerCapabilities();
    this.registerRoutes();
  }

  async stop(): Promise<void> {
    if (this.addedToHud) {
      this.bus.publish({
        channel: "hud.update",
        source: this.id,
        action: "remove",
        pieceId: this.id,
      });
      this.addedToHud = false;
    }
  }

  // ───────────────────────── state helpers ─────────────────────────

  private nextTabId(): string {
    this.tabIdCounter += 1;
    return `tab-${this.tabIdCounter}`;
  }

  private findTab(tabId: string): CanvasTab | undefined {
    return this.tabs.find(t => t.id === tabId);
  }

  private publishToHud(): void {
    this.historyCount += 1;

    const data: CanvasData = {
      tabs: this.tabs.map(t => ({ ...t })),
      historyCount: this.historyCount,
    };

    const action = this.addedToHud ? "update" : "add";
    this.addedToHud = true;

    this.bus.publish({
      channel: "hud.update",
      source: this.id,
      action,
      pieceId: this.id,
      piece: {
        pieceId: this.id,
        type: "panel",
        name: this.name,
        status: "running",
        data: data as unknown as Record<string, unknown>,
        position: { x: 100, y: 100 },
        size: { width: 900, height: 650 },
        ephemeral: true,
        renderer: { plugin: "jarvis-plugin-canvas", file: "CanvasRenderer" },
      },
      data: data as unknown as Record<string, unknown>,
      status: "running",
      visible: true,
    });
  }

  // ───────────────────────── capabilities ──────────────────────────

  private registerCapabilities(): void {
    const reg = this.ctx.capabilityRegistry;

    reg.register({
      name: "canvas_mermaid",
      description:
        "Open a new tab in the Canvas panel with a Mermaid diagram. Pass raw Mermaid syntax (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, pie, etc.). Returns the created tabId.",
      input_schema: {
        type: "object",
        properties: {
          syntax: {
            type: "string",
            description: "Raw Mermaid diagram source (without ```mermaid fences).",
          },
          title: {
            type: "string",
            description: "Optional tab title. Defaults to 'Diagram N'.",
          },
        },
        required: ["syntax"],
      },
      handler: async (input) => {
        const syntax = String(input.syntax ?? "").trim();
        if (!syntax) {
          return { success: false, error: "syntax is required" };
        }
        const id = this.nextTabId();
        const title = (input.title as string | undefined)?.trim() || `Diagram ${this.tabIdCounter}`;
        this.tabs.push({ id, type: "mermaid", title, content: syntax });
        this.publishToHud();
        return { success: true, tabId: id, title, type: "mermaid" };
      },
    });

    reg.register({
      name: "canvas_draw",
      description:
        "Open a new blank drawing tab in the Canvas panel. Optionally seed it with initial SVG content (e.g. pre-drawn shapes for the user to annotate). Returns the created tabId.",
      input_schema: {
        type: "object",
        properties: {
          svg: {
            type: "string",
            description: "Optional initial SVG markup (inner content — paths, shapes, text). Leave empty for a blank canvas.",
          },
          title: {
            type: "string",
            description: "Optional tab title. Defaults to 'Sketch N'.",
          },
        },
      },
      handler: async (input) => {
        const id = this.nextTabId();
        const title = (input.title as string | undefined)?.trim() || `Sketch ${this.tabIdCounter}`;
        const svg = typeof input.svg === "string" ? input.svg : "";
        this.tabs.push({ id, type: "draw", title, content: svg });
        this.publishToHud();
        return { success: true, tabId: id, title, type: "draw" };
      },
    });

    reg.register({
      name: "canvas_add",
      description:
        "Append SVG markup to an existing draw tab's content. Use to add annotations, highlights, or extra shapes. Only works on draw tabs.",
      input_schema: {
        type: "object",
        properties: {
          tabId: {
            type: "string",
            description: "Target tab ID (from canvas_draw result).",
          },
          svg: {
            type: "string",
            description: "SVG markup to append to the tab's content.",
          },
        },
        required: ["tabId", "svg"],
      },
      handler: async (input) => {
        const tabId = String(input.tabId);
        const svg = String(input.svg ?? "");
        const tab = this.findTab(tabId);
        if (!tab) return { success: false, error: `Tab ${tabId} not found` };
        if (tab.type !== "draw") {
          return { success: false, error: `Tab ${tabId} is type "${tab.type}", canvas_add only works on draw tabs` };
        }
        tab.content = `${tab.content}\n${svg}`;
        this.publishToHud();
        return { success: true, tabId, contentLength: tab.content.length };
      },
    });

    reg.register({
      name: "canvas_clear",
      description:
        "Clear canvas tabs. If tabId is provided, clears only that tab's content (keeps the tab open). If omitted, removes all tabs.",
      input_schema: {
        type: "object",
        properties: {
          tabId: {
            type: "string",
            description: "Optional tab ID to clear. Omit to clear all tabs.",
          },
        },
      },
      handler: async (input) => {
        const tabId = input.tabId as string | undefined;
        if (tabId) {
          const tab = this.findTab(tabId);
          if (!tab) return { success: false, error: `Tab ${tabId} not found` };
          tab.content = "";
          this.publishToHud();
          return { success: true, tabId, cleared: "content" };
        }
        const count = this.tabs.length;
        this.tabs = [];
        this.publishToHud();
        return { success: true, cleared: "all", removed: count };
      },
    });
  }

  // ───────────────────────── HTTP routes ───────────────────────────

  private registerRoutes(): void {
    this.ctx.registerRoute(
      "POST",
      "/plugins/canvas/send",
      ((req: IncomingMessage, res: ServerResponse) => this.handleSend(req, res)) as RouteHandler,
    );
  }

  private async handleSend(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody(req);
      const tabId = typeof body?.tabId === "string" ? body.tabId : "";
      const pngBase64 = typeof body?.pngBase64 === "string" ? body.pngBase64 : "";
      const description = typeof body?.description === "string" ? body.description.trim() : "";

      if (!tabId || !pngBase64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "tabId and pngBase64 are required" }));
        return;
      }

      // Strip data URL prefix if the client included one.
      const base64 = pngBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");

      // Validate that the base64 represents a real PNG image.
      // A valid PNG needs the 8-byte magic header + at least IHDR + IDAT + IEND chunks.
      // Minimum ~67 bytes raw → ~90 chars base64. We check magic bytes + minimum length.
      if (!isValidPngBase64(base64)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid PNG image: base64 data is too small or has wrong header. A valid PNG must be at least 90 base64 characters with correct PNG magic bytes." }));
        return;
      }

      const text = `[SYSTEM] User sent drawing from canvas tab "${tabId}"${description ? `: ${description}` : ""}. See attached image.`;

      this.bus.publish({
        channel: "ai.request",
        source: this.id,
        target: "main",
        text,
        images: [
          {
            label: "Canvas Drawing",
            base64,
            mediaType: "image/png",
          },
        ],
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, tabId }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  }
}

// ───────────────────────── utils ──────────────────────────────────

const PNG_MAGIC_B64 = "iVBORw0KGgo"; // base64 of \x89PNG\r\n\x1a\n
const MIN_PNG_B64_LENGTH = 90; // ~67 raw bytes → minimum valid 1x1 PNG

function isValidPngBase64(b64: string): boolean {
  if (!b64 || b64.length < MIN_PNG_B64_LENGTH) return false;
  if (!b64.startsWith(PNG_MAGIC_B64)) return false;
  // Verify it's decodable — try decoding the first chunk
  try {
    const sample = b64.slice(0, 64);
    Buffer.from(sample, "base64");
    return true;
  } catch {
    return false;
  }
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
