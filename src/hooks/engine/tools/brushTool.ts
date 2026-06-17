import { DrawingToolStrategy } from "./types";
import { resolvePressure } from "../pressure";
import { mapPressure } from "../pressureCurve";

export const brushTool: DrawingToolStrategy = {
  onPointerDown: ({ state, coords, pressure, pointerType, refs, actions }) => {
    actions.prepararCache();
    refs.currentPoint.current = coords;
    refs.lastPoint.current = coords;
    actions.setIsDrawing(true);
    refs.isDrawing.current = true;

    // Soporte de tableta: lápiz → presión real; mouse → ancho completo.
    // Después de resolver, la curva de presión moldea cómo la fuerza se vuelve grosor
    // (Lineal = identidad; Suave/Dura cambian la respuesta).
    const p = mapPressure(
      resolvePressure(pointerType, pressure),
      state.settings.pressureCurve,
    );

    // 🚀 FIX: El truco del punto fantasma.
    // Añadimos una coordenada idéntica desplazada 0.01px para engañar a Rust
    // y que dibuje un punto redondo perfecto aunque no movamos el ratón.
    refs.strokePoints.current = [
      { x: coords.x, y: coords.y, p },
      { x: coords.x + 0.01, y: coords.y + 0.01, p },
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
            ? "rgba(255, 255, 255, 1)"
            : state.settings.color;

        wetCtx.lineWidth = state.settings.size * p * 2;

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
        ? "rgba(255, 255, 255, 1)"
        : state.settings.color;

    wetCtx.lineCap = "round";
    wetCtx.lineJoin = "round";

    const weight = 1 - state.settings.smoothing;

    for (let event of events) {
      const coords = actions.getCoords(event.clientX, event.clientY);
      if (!coords) continue;

      // Soporte de tableta: lápiz → presión real por evento; mouse → ancho completo.
      // La curva de presión se aplica tras resolver, igual que en onPointerDown.
      const pressure = mapPressure(
        resolvePressure(event.pointerType, event.pressure),
        state.settings.pressureCurve,
      );

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
