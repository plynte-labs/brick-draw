// src/hooks/engine/tools/index.ts
import { brushTool } from "./brushTool";
import { wandTool } from "./wandTool";
import { DrawingToolStrategy } from "./types";
import { DrawingTool } from "../../../store/types";
import { moveTool } from "./moveTool";
import { transformTool } from "./transformTool";

export const getToolStrategy = (toolName: DrawingTool): DrawingToolStrategy => {
  switch (toolName) {
    case "wand":
      return wandTool;
    case "move": // 🚀 REGISTRAMOS
      return moveTool;
    case "transform":
      // Driven by the TransformGizmo DOM overlay; no stroke-engine behavior.
      return transformTool;
    case "eraser":
    case "brush":
    default:
      // Pincel y Goma comparten la misma estrategia (se diferencian por el color interno)
      return brushTool;
  }
};
