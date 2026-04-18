import type { PluginContext } from "@jarvis/core";
import { CanvasPiece } from "./canvas.js";

export function createPieces(ctx: PluginContext) {
  return [new CanvasPiece(ctx)];
}
