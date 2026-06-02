// src/services/aiService.ts
import { obtenerLienzoPng } from "./tauriService";

const AI_SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || "";

export const generarImagenIA = async (
  prompt: string,
  strength: number = 0.6,
) => {
  try {
    console.log("1. Pidiendo lienzo a Rust...");
    // Obtenemos los bytes del PNG desde Rust
    const res = await obtenerLienzoPng();
    if (!res.success) throw new Error(res.error);
    const pngBytes = res.data;

    // Convertimos a un archivo (Blob) que el navegador pueda enviar
    const blob = new Blob([new Uint8Array(pngBytes)], { type: "image/png" });

    // Preparamos el formulario (FormData) tal como lo espera FastAPI
    const formData = new FormData();
    formData.append("image", blob, "boceto.png");
    formData.append("prompt", prompt);
    formData.append("strength", strength.toString());
    formData.append("num_inference_steps", "30");
    formData.append("guidance_scale", "7.0");
    formData.append("forzar_cuadrado", "false");

    console.log("2. Enviando al servidor de Python...");

    // Hacemos la petición POST a Python
    const response = await fetch(AI_SERVER_URL, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error del servidor IA: ${errorText}`);
    }

    console.log("3. ¡Imagen recibida! Procesando...");

    // Recibimos la nueva imagen
    const imageBlob = await response.blob();

    // Devolvemos el Blob para que React pueda inyectarlo en el Canvas
    return imageBlob;
  } catch (error) {
    console.error("Error en el pipeline de IA:", error);
    throw error;
  }
};
