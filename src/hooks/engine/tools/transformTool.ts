// src/hooks/engine/tools/transformTool.ts
//
// The "transform" tool is driven entirely by the <TransformGizmo/> DOM overlay,
// NOT by the stroke engine. This strategy is intentionally a NO-OP so that
// pointer events reaching the canvas while the transform tool is active never
// trigger a stroke, a wet-layer dry, or a layer move. All interaction (scale /
// rotate / translate / commit / cancel) happens in the gizmo's own handles.
import { DrawingToolStrategy } from "./types";

export const transformTool: DrawingToolStrategy = {
  onPointerDown: () => {
    // No-op: the gizmo owns all transform interaction.
  },
  onPointerMove: () => false,
};
