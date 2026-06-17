// src/hooks/engine/pressure.ts
// Resolución de presión efectiva según el tipo de puntero (soporte de tabletas Wacom/Huion/etc.).
// - 'pen'           → presión REAL del lápiz (0..1), con un piso pequeño para que un toque muy suave
//                     no dé ancho 0. Así el grosor del trazo responde a cuánto apretás.
// - 'mouse'/'touch' → 1.0 (ancho completo). Los navegadores reportan pressure=0.5 al hacer click con
//                     mouse, lo que dejaba el trazo a mitad de grosor; con 1.0 dibuja parejo.
// Función PURA y reutilizable (pincel, goma y el flush la usan).
export const resolvePressure = (
  pointerType: string | undefined,
  raw: number,
): number => {
  // Solo el MOUSE explícito va a ancho completo (reporta pressure=0.5 al click, no es presión real).
  // Lápiz / touch / desconocido usan la presión REAL: algunos drivers de tableta reportan pointerType
  // distinto de "pen" (modo mouse), y gatear estricto en "pen" mataba la presión que sí existía.
  if (pointerType === "mouse") return 1.0;
  const p = raw > 0 ? raw : 0.5;
  return Math.min(1, Math.max(0.05, p));
};
