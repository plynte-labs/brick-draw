import { useEffect } from "react";
import { useAppStore } from "../store/useStore";
import {
  isTauri,
  deshacer,
  rehacer,
  obtenerCapaPng,
} from "../services/tauriService";

export const useHotkeys = () => {
  const { setSettings, forceRender, setModifiers } = useAppStore();

  const sincronizarCapaDesdeRust = async (layerId: string | null) => {
    if (!layerId) return;
    try {
      const res = await obtenerCapaPng(layerId);
      if (!res.success) throw new Error(res.error);
      const pngBytes = res.data;
      const state = useAppStore.getState();
      const layer = state.layers.find((l) => l.id === layerId);
      const { width, height } = state.canvasSize; // 🚀 FIX

      if (layer) {
        const ctx = layer.buffer.getContext("2d");
        if (!ctx) return;

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1.0;

        const blob = new Blob([new Uint8Array(pngBytes)], {
          type: "image/png",
        });
        const imgBitmap = await createImageBitmap(blob);

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(imgBitmap, 0, 0);
        forceRender();
      }
    } catch (error) {
      console.error("❌ Error sincronizando capa:", error);
    }
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "Shift") setModifiers({ shift: true });
      if (e.key === "Control" || e.key === "Meta") setModifiers({ ctrl: true });

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
          e.preventDefault();
          if (isTauri()) {
            const res = await deshacer();
            if (res.success && res.data) {
              await sincronizarCapaDesdeRust(res.data);
            }
          }
        }
        if (
          e.key.toLowerCase() === "y" ||
          (e.key.toLowerCase() === "z" && e.shiftKey)
        ) {
          e.preventDefault();
          if (isTauri()) {
            const res = await rehacer();
            if (res.success && res.data) {
              await sincronizarCapaDesdeRust(res.data);
            }
          }
        }
        return;
      }

      if (!e.ctrlKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "b":
            setSettings({ tool: "brush" });
            break;
          case "e":
            setSettings({ tool: "eraser" });
            break;
          case "w":
            setSettings({ tool: "wand" });
            break;
          case "m":
            setSettings({ tool: "move" });
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setModifiers({ shift: false });
      if (e.key === "Control" || e.key === "Meta")
        setModifiers({ ctrl: false });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [setSettings, forceRender, setModifiers]);
};
