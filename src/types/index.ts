export type DrawingTool = "brush" | "eraser";

export interface BrushSettings {
  tool: DrawingTool;
  color: string;
  size: number;
  opacity: number;
}
