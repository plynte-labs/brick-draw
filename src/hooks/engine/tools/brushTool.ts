import { DrawingToolStrategy } from "./types";

export const brushTool: DrawingToolStrategy = {
  onPointerDown: ({ state, coords, pressure, refs, actions }) => {
    actions.prepararCache();
    refs.currentPoint.current = coords;
    refs.lastPoint.current = coords;
    actions.setIsDrawing(true);
    refs.isDrawing.current = true;

    // 🚀 FIX: El truco del punto fantasma.
    // Añadimos una coordenada idéntica desplazada 0.01px para engañar a Rust
    // y que dibuje un punto redondo perfecto aunque no movamos el ratón.
    refs.strokePoints.current = [
      { x: coords.x, y: coords.y, p: pressure },
      { x: coords.x + 0.01, y: coords.y + 0.01, p: pressure },
    ];

    if (refs.wetLayer.current) {
      const wetCtx = refs.wetLayer.current.getContext("2d");
      if (wetCtx) {
        const { width, height } = state.canvasSize;
        wetCtx.clearRect(0, 0, width, height);

        wetCtx.lineCap = "round";

        // 🚀 MEJORA UI: Dejamos el blanco semitransparente para la goma,
        // así ves dónde vas a borrar antes de soltar el clic.
        wetCtx.strokeStyle =
          state.settings.tool === "eraser"
            ? "rgba(255, 255, 255, 0.4)"
            : state.settings.color;

        wetCtx.lineWidth = state.settings.size * pressure * 2;

        wetCtx.beginPath();
        wetCtx.moveTo(coords.x, coords.y);
        wetCtx.lineTo(coords.x + 0.01, coords.y + 0.01);
        wetCtx.stroke();

        if (refs.hasSelection.current && refs.selectionMask.current) {
          wetCtx.globalCompositeOperation = "destination-in";
          wetCtx.drawImage(refs.selectionMask.current, 0, 0);
          wetCtx.globalCompositeOperation = "source-over";
        }

        actions.componerLienzo(true);
      }
    }
  },

  onPointerMove: ({ events, state, refs, actions }) => {
    if (!events || !refs.wetLayer.current) return false;

    const wetCtx = refs.wetLayer.current.getContext("2d");
    if (!wetCtx) return false;

    wetCtx.strokeStyle =
      state.settings.tool === "eraser"
        ? "rgba(255, 255, 255, 0.4)"
        : state.settings.color;

    wetCtx.lineCap = "round";
    wetCtx.lineJoin = "round";

    const weight = 1 - state.settings.smoothing;

    for (let event of events) {
      const coords = actions.getCoords(event.clientX, event.clientY);
      if (!coords) continue;

      const pressure = event.pressure || 0.5;

      if (state.settings.smoothing === 0) {
        refs.currentPoint.current = coords;
      } else {
        refs.currentPoint.current.x +=
          (coords.x - refs.currentPoint.current.x) * weight;
        refs.currentPoint.current.y +=
          (coords.y - refs.currentPoint.current.y) * weight;
      }

      wetCtx.lineWidth = state.settings.size * pressure * 2;
      wetCtx.beginPath();
      wetCtx.moveTo(refs.lastPoint.current.x, refs.lastPoint.current.y);
      wetCtx.lineTo(refs.currentPoint.current.x, refs.currentPoint.current.y);
      wetCtx.stroke();

      refs.lastPoint.current = { ...refs.currentPoint.current };
      refs.strokePoints.current.push({
        x: refs.currentPoint.current.x,
        y: refs.currentPoint.current.y,
        p: pressure,
      });
    }

    if (refs.hasSelection.current && refs.selectionMask.current) {
      wetCtx.globalCompositeOperation = "destination-in";
      wetCtx.drawImage(refs.selectionMask.current, 0, 0);
      wetCtx.globalCompositeOperation = "source-over";
    }

    return true;
  },
};
