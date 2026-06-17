import { useEffect } from "react";
import { useAppStore } from "../store/useStore";
import {
  isTauri,
  deshacer,
  rehacer,
  obtenerCapaPng,
} from "../services/tauriService";
import { UndoResult } from "../types/UndoResult";
import { Layer } from "../store/types";

export const useHotkeys = () => {
  const { setSettings, forceRender, setModifiers } = useAppStore();

  // Re-pulls a layer's pixels from Rust and blits them into the (existing) OffscreenCanvas buffer.
  // Used for the pixel-undo path (master behaviour) and to fill a freshly rebuilt buffer after a
  // delete-undo reinsert.
  const sincronizarCapaDesdeRust = async (layerId: string | null) => {
    if (!layerId) return;
    try {
      const res = await obtenerCapaPng(layerId);
      if (!res.success) throw new Error(res.error);
      const pngBytes = res.data;
      const state = useAppStore.getState();
      const layer = state.layers.find((l) => l.id === layerId);

      if (layer) {
        const ctx = layer.buffer.getContext("2d");
        if (!ctx) return;

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1.0;

        const blob = new Blob([new Uint8Array(pngBytes)], {
          type: "image/png",
        });
        const imgBitmap = await createImageBitmap(blob);

        ctx.clearRect(0, 0, layer.buffer.width, layer.buffer.height);
        ctx.drawImage(imgBitmap, 0, 0);
        forceRender();
      }
    } catch (error) {
      console.error("❌ Error sincronizando capa:", error);
    }
  };

  // Applies a structured undo/redo result to the Zustand store. The pixel path keeps the original
  // behaviour (re-pull the layer PNG); structural ops patch the store directly so the layer panel,
  // transforms, opacity and z-order reflect the reverted/reapplied state.
  const applyUndoResult = async (result: UndoResult) => {
    switch (result.kind) {
      case "pixel": {
        await sincronizarCapaDesdeRust(result.layer_id);
        break;
      }

      case "move": {
        if (result.x !== null && result.y !== null) {
          useAppStore
            .getState()
            .setLayerPosition(result.layer_id, result.x, result.y);
          forceRender();
        }
        break;
      }

      case "opacity": {
        if (result.opacity !== null) {
          // Patch the store WITHOUT a backend round-trip (Rust already applied the change).
          useAppStore.setState((state) => ({
            layers: state.layers.map((l) =>
              l.id === result.layer_id ? { ...l, opacity: result.opacity! } : l
            ),
          }));
          forceRender();
        }
        break;
      }

      case "visibility": {
        if (result.visible !== null) {
          useAppStore.setState((state) => ({
            layers: state.layers.map((l) =>
              l.id === result.layer_id ? { ...l, visible: result.visible! } : l
            ),
          }));
          forceRender();
        }
        break;
      }

      case "delete": {
        const state = useAppStore.getState();
        if (result.layer_exists) {
          // Undo of a deletion: reinsert the layer at its original z-order and refill its pixels.
          const width = result.width ?? state.canvasSize.width;
          const height = result.height ?? state.canvasSize.height;
          const buffer = new OffscreenCanvas(width, height);

          const restored: Layer = {
            id: result.layer_id,
            name: result.layer_id,
            visible: result.visible ?? true,
            locked: false,
            opacity: result.opacity ?? 1,
            buffer,
            x: result.x ?? 0,
            y: result.y ?? 0,
          };

          const insertAt = result.index ?? state.layers.length;
          const newLayers = [...state.layers];
          newLayers.splice(insertAt, 0, restored);
          useAppStore.getState().setLayers(newLayers);
          useAppStore.setState({
            activeLayerId: result.active_layer_id ?? result.layer_id,
          });
          // Pull the snapshot pixels Rust reinserted.
          await sincronizarCapaDesdeRust(result.layer_id);
        } else {
          // Redo of a deletion: drop the layer again.
          const newLayers = state.layers.filter((l) => l.id !== result.layer_id);
          useAppStore.getState().setLayers(newLayers);
          useAppStore.setState({
            activeLayerId:
              result.active_layer_id ||
              newLayers[newLayers.length - 1]?.id ||
              null,
          });
        }
        break;
      }

      case "reorder": {
        if (result.order) {
          const state = useAppStore.getState();
          const byId = new Map(state.layers.map((l) => [l.id, l]));
          const reordered = result.order
            .map((id) => byId.get(id))
            .filter((l): l is Layer => !!l);
          // Append any layers not present in the order list (defensive).
          for (const l of state.layers) {
            if (!result.order.includes(l.id)) reordered.push(l);
          }
          useAppStore.getState().setLayers(reordered);
        }
        break;
      }

      case "selection": {
        // The native selection mask lives in Rust; just repaint so the overlay reflects it.
        forceRender();
        break;
      }

      default:
        // Unknown kind — repaint defensively.
        forceRender();
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
              await applyUndoResult(res.data);
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
              await applyUndoResult(res.data);
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
