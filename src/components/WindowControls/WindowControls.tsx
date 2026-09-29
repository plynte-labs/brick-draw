import React from "react";
import {
  VscChromeMinimize,
  VscChromeMaximize,
  VscChromeRestore,
  VscChromeClose,
} from "react-icons/vsc";
import { useWindowControls } from "../../hooks/useWindowControls";

interface WindowControlsProps {
  className?: string;
}

export const WindowControls: React.FC<WindowControlsProps> = ({ className = "" }) => {
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
        <VscChromeMinimize className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        title={isMaximized ? "Restore" : "Maximize"}
        onClick={() => void toggleMaximize()}
      >
        {isMaximized ? (
          <VscChromeRestore className="w-3.5 h-3.5" />
        ) : (
          <VscChromeMaximize className="w-3.5 h-3.5" />
        )}
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        aria-label="Close window"
        title="Close"
        onClick={() => void close()}
      >
        <VscChromeClose className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default WindowControls;
