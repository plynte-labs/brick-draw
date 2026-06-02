// src/services/tauriService.ts
import { PuntoTrazo } from "../types/PuntoTrazo";
import { LayerBounds } from "../types/LayerBounds";
import { CanvasMetadataDto } from "../types/CanvasMetadataDto";
import { ProyectoBrickResponse } from "../types/ProyectoBrickResponse";

export type TauriResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Helper centralizado para verificar si estamos corriendo dentro de Tauri
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
};

// Caches para los módulos cargados dinámicamente
let tauriCoreModule: any = null;
let tauriDialogModule: any = null;
let tauriEventModule: any = null;

// Cargadores dinámicos perezosos (lazy-loading)
const getTauriCore = async () => {
  if (tauriCoreModule) return tauriCoreModule;
  if (isTauri()) {
    try {
      tauriCoreModule = await import("@tauri-apps/api/core");
      return tauriCoreModule;
    } catch (error) {
      console.error("Error al importar dinámicamente @tauri-apps/api/core:", error);
    }
  }
  return null;
};

const getTauriDialog = async () => {
  if (tauriDialogModule) return tauriDialogModule;
  if (isTauri()) {
    try {
      tauriDialogModule = await import("@tauri-apps/plugin-dialog");
      return tauriDialogModule;
    } catch (error) {
      console.error("Error al importar dinámicamente @tauri-apps/plugin-dialog:", error);
    }
  }
  return null;
};

const getTauriEvent = async () => {
  if (tauriEventModule) return tauriEventModule;
  if (isTauri()) {
    try {
      tauriEventModule = await import("@tauri-apps/api/event");
      return tauriEventModule;
    } catch (error) {
      console.error("Error al importar dinámicamente @tauri-apps/api/event:", error);
    }
  }
  return null;
};

/**
 * Función genérica defensiva para invocar comandos de Rust de forma segura.
 * Captura todos los errores del puente IPC y previene cuelgues en el navegador.
 */
export const safeInvoke = async <T>(
  cmd: string,
  args?: Record<string, any>
): Promise<TauriResult<T>> => {
  try {
    if (!isTauri()) {
      return {
        success: false,
        error: `Entorno no soportado para el comando '${cmd}' (Modo Navegador/Web)`,
      };
    }
    const core = await getTauriCore();
    if (!core) {
      return {
        success: false,
        error: "Adaptador de Tauri Core no disponible",
      };
    }
    const data = await core.invoke(cmd, args);
    return { success: true, data };
  } catch (error: any) {
    console.error(`Error en comando Tauri '${cmd}':`, error);
    const errorMsg =
      error?.message ||
      (typeof error === "string" ? error : JSON.stringify(error)) ||
      "Error desconocido en Rust";
    return { success: false, error: errorMsg };
  }
};

/* ==========================================================================
   ADAPTADORES DE INFRAESTRUCTURA (Capa de Aplicación ⇄ Rust Commands)
   ========================================================================== */

/**
 * Registra una nueva capa en el estado nativo de Rust.
 */
export const anadirCapa = async (
  id: string,
  width: number,
  height: number
): Promise<TauriResult<void>> => {
  return safeInvoke<void>("anadir_capa", { id, width, height });
};

/**
 * Activa una capa específica en el backend nativo.
 */
export const activarCapa = async (id: string): Promise<TauriResult<void>> => {
  return safeInvoke<void>("activar_capa", { id });
};

/**
 * Cambia el estado de visibilidad de una capa en el motor nativo.
 */
export const cambiarVisibilidadCapa = async (
  id: string,
  visible: boolean
): Promise<TauriResult<void>> => {
  return safeInvoke<void>("cambiar_visibilidad_capa", { id, visible });
};

/**
 * Modifica la opacidad de una capa en Rust.
 */
export const cambiarOpacidadCapa = async (
  id: string,
  opacity: number
): Promise<TauriResult<void>> => {
  return safeInvoke<void>("cambiar_opacidad_capa", { id, opacity });
};

/**
 * Elimina una capa del motor nativo.
 */
export const eliminarCapa = async (id: string): Promise<TauriResult<void>> => {
  return safeInvoke<void>("eliminar_capa", { id });
};

/**
 * Reordena las capas en el motor nativo según el orden indicado por el gestor visual.
 */
export const reordenarCapas = async (
  nuevosIds: string[]
): Promise<TauriResult<void>> => {
  return safeInvoke<void>("reordenar_capas", { nuevosIds });
};

/**
 * Registra la nueva posición (x, y) de una capa trasladada.
 */
export const moverCapa = async (
  id: string,
  x: number,
  y: number
): Promise<TauriResult<void>> => {
  return safeInvoke<void>("mover_capa", { id, x, y });
};

/**
 * Procesa matemáticamente un trazo en el búfer de Rust y retorna los nuevos límites de la capa.
 */
export const procesarTrazo = async (
  idCapa: string,
  puntos: PuntoTrazo[],
  tool: string,
  color: string,
  size: number,
  opacity: number
): Promise<TauriResult<LayerBounds | null>> => {
  return safeInvoke<LayerBounds | null>("procesar_trazo", {
    idCapa,
    puntos,
    tool,
    color,
    size,
    opacity,
  });
};

/**
 * Obtiene los bytes de imagen comprimidos en formato PNG para una capa específica.
 */
export const obtenerCapaPng = async (id: string): Promise<TauriResult<number[]>> => {
  return safeInvoke<number[]>("obtener_capa_png", { id });
};

/**
 * Obtiene la composición final de todas las capas en formato PNG.
 */
export const obtenerLienzoPng = async (): Promise<TauriResult<number[]>> => {
  return safeInvoke<number[]>("obtener_lienzo_png");
};

/**
 * Carga un buffer de bytes PNG directamente en los píxeles de una capa nativa en Rust.
 */
export const cargarPngEnCapa = async (
  id: string,
  pngBytes: Uint8Array
): Promise<TauriResult<void>> => {
  // Convertimos a array simple para garantizar la serialización correcta del puente JSON
  const bytesAsNumberArray = Array.from(pngBytes);
  return safeInvoke<void>("cargar_png_en_capa", {
    id,
    pngBytes: bytesAsNumberArray,
  });
};

/**
 * Revierte la última acción en el historial de comandos de Rust.
 * Retorna el ID de la capa afectada para su resincronización en el frontend.
 */
export const deshacer = async (): Promise<TauriResult<string | null>> => {
  return safeInvoke<string | null>("deshacer");
};

/**
 * Rehace la última acción descartada en el historial de comandos de Rust.
 * Retorna el ID de la capa afectada para su resincronización en el frontend.
 */
export const rehacer = async (): Promise<TauriResult<string | null>> => {
  return safeInvoke<string | null>("rehacer");
};

/**
 * Calcula de forma nativa la selección por varita mágica (Flood Fill) y retorna la máscara en PNG.
 */
export const calcularSeleccionVarita = async (
  idCapa: string,
  startX: number,
  startY: number,
  tolerancia: number
): Promise<TauriResult<number[]>> => {
  return safeInvoke<number[]>("calcular_seleccion_varita", {
    idCapa,
    startX,
    startY,
    tolerancia,
  });
};

/**
 * Guarda la composición actual en un archivo físico del sistema de archivos nativo.
 */
export const guardarDibujo = async (ruta: string): Promise<TauriResult<string>> => {
  return safeInvoke<string>("guardar_dibujo", { ruta });
};

/**
 * Abre la ventana modal del sistema operativo para guardar un archivo.
 */
export const saveFileDialog = async (options: {
  title: string;
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
}): Promise<TauriResult<string | null>> => {
  try {
    if (!isTauri()) {
      return {
        success: false,
        error: "No estamos en entorno Tauri (Guardado de archivos no soportado en web)",
      };
    }
    const dialog = await getTauriDialog();
    if (!dialog) {
      return {
        success: false,
        error: "Adaptador de Diálogos del OS no disponible",
      };
    }
    const path = await dialog.save(options);
    return { success: true, data: path };
  } catch (error: any) {
    console.error("Error al desplegar diálogo de guardado:", error);
    return {
      success: false,
      error: error?.message || String(error) || "Error al solicitar diálogo de archivo",
    };
  }
};

/**
 * Abre la ventana modal del sistema operativo para seleccionar y abrir un archivo.
 */
export const openFileDialog = async (options: {
  title: string;
  filters: { name: string; extensions: string[] }[];
}): Promise<TauriResult<string | null>> => {
  try {
    if (!isTauri()) {
      return {
        success: false,
        error: "No estamos en entorno Tauri (Selección de archivos no soportada en web)",
      };
    }
    const dialog = await getTauriDialog();
    if (!dialog) {
      return {
        success: false,
        error: "Adaptador de Diálogos del OS no disponible",
      };
    }
    const path = await dialog.open({
      multiple: false,
      directory: false,
      ...options,
    });
    return { success: true, data: path as string | null };
  } catch (error: any) {
    console.error("Error al desplegar diálogo de apertura:", error);
    return {
      success: false,
      error: error?.message || String(error) || "Error al solicitar diálogo de archivo",
    };
  }
};


/**
 * Registra un listener asíncrono para escuchar eventos emitidos por el backend de Rust.
 * Retorna una función para cancelar la suscripción y evitar fugas de memoria.
 */
export const suscribirAEvento = async <T>(
  event: string,
  handler: (payload: T) => void
): Promise<TauriResult<() => void>> => {
  try {
    if (!isTauri()) {
      return {
        success: false,
        error: "No estamos en entorno Tauri (Los eventos de sistema no se soportan en web)",
      };
    }
    const eventModule = await getTauriEvent();
    if (!eventModule) {
      return {
        success: false,
        error: "Adaptador de Eventos de Tauri no disponible",
      };
    }
    const unlisten = await eventModule.listen(event, (ev: any) => {
      handler(ev.payload);
    });
    return { success: true, data: unlisten };
  } catch (error: any) {
    console.error(`Error al suscribirse al evento '${event}':`, error);
    return {
      success: false,
      error: error?.message || String(error) || "Error de suscripción",
    };
  }
};

/**
 * Guarda el lienzo actual y todas sus capas en un archivo contenedor .brick empaquetado y comprimido en ZIP.
 */
export const guardarProyectoBrick = async (
  ruta: string,
  metadata: CanvasMetadataDto
): Promise<TauriResult<string>> => {
  return safeInvoke<string>("guardar_proyecto_brick", { ruta, metadata });
};

/**
 * Carga un proyecto .brick, reconstruye el AppState nativo en Rust, limpia el historial,
 * y retorna los metadatos y los buffers de píxeles des-premultiplicados de las capas.
 */
export const cargarProyectoBrick = async (
  ruta: string
): Promise<TauriResult<ProyectoBrickResponse>> => {
  return safeInvoke<ProyectoBrickResponse>("cargar_proyecto_brick", { ruta });
};

