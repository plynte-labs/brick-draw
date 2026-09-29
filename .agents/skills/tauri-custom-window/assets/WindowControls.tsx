import React from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useWindowControls } from "./useWindowControls";

interface WindowControlsProps {
  className?: string;
}

export function WindowControls({ className = "" }: WindowControlsProps) {
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  return (
    <div className={`flex h-full shrink-0 select-none items-stretch ${className}`}>
      <button
        type="button"
        className="window-control"
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void minimize()}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        title={isMaximized ? "Restore" : "Maximize"}
        onClick={() => void toggleMaximize()}
      >
        {isMaximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        aria-label="Close window"
        title="Close"
        onClick={() => void close()}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
