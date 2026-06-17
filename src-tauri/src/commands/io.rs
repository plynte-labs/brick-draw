// src-tauri/src/commands/io.rs
use crate::state::{AppState};
use std::sync::Arc;
use parking_lot::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;
use std::io::{Read, Write};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use tauri::{State, AppHandle};

use tiny_skia::{ Color, Pixmap, PixmapPaint, Transform};

/// Maximum allowed PNG file size (50 MB) — prevents memory exhaustion attacks
const MAX_PNG_SIZE_BYTES: usize = 50 * 1024 * 1024;

/// Minimum interval between saves (500 ms) — prevents rapid-fire disk writes
const MIN_SAVE_INTERVAL_MS: u128 = 500;

// ── Seguridad al cargar .brick: límites contra bombas de descompresión / OOM ──
/// Dimensión máxima por capa (px). Rechaza metadatos con tamaños absurdos antes de reservar memoria.
const MAX_DIMENSION: u32 = 16384;
/// Tope total de bytes crudos de todas las capas (256 MB). Frena una bomba de muchas capas/grandes.
const MAX_TOTAL_RAW_BYTES: usize = 256 * 1024 * 1024;
/// Tope del manifiesto canvas.json inflado (4 MB). La entrada JSON antes no tenía cota.
const MAX_CANVAS_JSON_BYTES: u64 = 4 * 1024 * 1024;

/// Ruta temporal hermana (mismo volumen) para escritura atómica: nombre único por proceso+nanos
/// para evitar colisión entre guardados concurrentes.
fn temp_sibling(target: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let parent = target
        .parent()
        .ok_or("Seguridad: ruta sin directorio padre válido.")?;
    let base = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("brickdraw");
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Ok(parent.join(format!(".{}.{}.{}.tmp", base, std::process::id(), nanos)))
}

/// Escritura ATÓMICA de bytes: escribe a un temporal hermano, hace sync_all y luego rename sobre el
/// destino (rename es atómico en el mismo volumen). Si algo falla, el archivo previo queda INTACTO
/// y el temporal se borra. Evita corromper un proyecto/exportación al fallar/crashear a mitad.
fn atomic_write(target: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = temp_sibling(target)?;
    let res = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        Ok(())
    })();
    if let Err(e) = res {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("Error al escribir archivo temporal: {}", e));
    }
    if let Err(e) = std::fs::rename(&tmp, target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("Error al confirmar el guardado atómico (rename): {}", e));
    }
    Ok(())
}

#[tauri::command]
pub fn guardar_dibujo(
    _app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
    ruta: String,
) -> Result<String, String> {
    // ── CAPA 1: Validación estricta contra Path Traversal (defensa en profundidad) ──
    let path = std::path::Path::new(&ruta);

    // Rechazar rutas relativas inmediatamente
    if !path.is_absolute() {
        return Err("Seguridad: La ruta debe ser absoluta.".to_string());
    }

    // Bloquear componentes de directorio padre en la ruta original
    for component in path.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Seguridad: Intento de Path Traversal (../) detectado y denegado.".to_string());
        }
    }

    // Validar extensión .png exclusivamente
    if path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase() != "png" {
        return Err("Seguridad: Operación denegada. Solo se permite extensión .png.".to_string());
    }

    // ── CAPA 2: Canonicalización para resolver symlinks y normalización Unicode ──
    // canonicalize() resuelve symlinks, normaliza separadores, y expande rutas UNC en Windows.
    // Esto previene bypasses mediante symlinks que apunten fuera del directorio permitido.
    let canonical = path.canonicalize()
        .map_err(|e| e.to_string())
        .or_else(|_| {
            let parent = path.parent()
                .ok_or_else(|| "Seguridad: Ruta sin directorio padre válido.".to_string())?;
            let file_name = path.file_name()
                .ok_or_else(|| "Seguridad: Ruta sin nombre de archivo.".to_string())?;
            parent.canonicalize()
                .map_err(|e| format!("Seguridad: No se pudo canonicalizar: {}", e))
                .map(|p| p.join(file_name))
        })?;

    // ── CAPA 3: Validación contra directorios críticos del sistema y raíces ──
    // Permite al usuario elegir dónde guardar (incluyendo otros discos/volúmenes),
    // pero bloquea directorios críticos del sistema operativo para evitar vulnerabilidades de Path Traversal.
    let parent = canonical.parent()
        .ok_or_else(|| "Seguridad: La ruta debe poseer un directorio padre válido.".to_string())?;

    // Bloquear escrituras directas en la raíz de cualquier unidad (ej. C:\ o D:\)
    if parent.components().count() <= 1 {
        return Err("Seguridad: No se permite guardar archivos directamente en la raíz de ninguna unidad.".to_string());
    }

    // Verificar si es una ruta del sistema operativo insegura (ej. C:\Windows, C:\Program Files, etc.)
    if es_ruta_sistema_insegura(&canonical) {
        return Err("Seguridad: Operación denegada. No se permite escribir en directorios del sistema operativo por razones de seguridad.".to_string());
    }

    // ── CAPA 4: Rate limiting — previene escritura rápida repetida ──
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Error de tiempo: {}", e))?
        .as_millis();

    {
        let state_lock = state.read();
        let elapsed = now.saturating_sub(state_lock.last_save_timestamp_ms);
        if elapsed < MIN_SAVE_INTERVAL_MS {
            return Err(format!(
                "Rate limit: Espera {} ms entre guardados.",
                MIN_SAVE_INTERVAL_MS.saturating_sub(elapsed)
            ));
        }
    }

    // ── Composición del lienzo (lectura del estado) ──
    let state_lock = state.read();

    let width = state_lock.canvas_width;
    let height = state_lock.canvas_height;

    if width == 0 || height == 0 {
        return Err("Lienzo no inicializado".to_string());
    }

    let mut master_pixmap = Pixmap::new(width, height).ok_or("Error reservando memoria")?;
    master_pixmap.fill(Color::WHITE);

    for layer in state_lock.layers.iter() {
        if !layer.visible || layer.opacity <= 0.0 {
            continue;
        }

        let buffer = layer.buffer.read();
        let mut pixmap_paint = PixmapPaint::default();
        pixmap_paint.opacity = layer.opacity;

        master_pixmap.draw_pixmap(
            layer.x as i32, layer.y as i32,
            buffer.as_ref(),
            &pixmap_paint,
            Transform::identity(),
            None,
        );
    }

    // ── Codificación PNG en memoria ──
    let png_data = master_pixmap.encode_png().map_err(|e| format!("Error codificando PNG: {}", e))?;

    // ── CAPA 5: Validación de tamaño de archivo ──
    if png_data.len() > MAX_PNG_SIZE_BYTES {
        return Err(format!(
            "Seguridad: Imagen demasiado grande ({} MB). Límite: {} MB.",
            png_data.len() / (1024 * 1024),
            MAX_PNG_SIZE_BYTES / (1024 * 1024)
        ));
    }

    // ── Escritura ATÓMICA usando la ruta canonicalizada (temp + sync + rename) ──
    // Si falla a mitad, el PNG previo en disco queda intacto (no se corrompe).
    atomic_write(&canonical, &png_data)?;

    // ── Actualizar métricas de rate limiting ──
    drop(state_lock);
    {
        let mut state_lock = state.write();
        state_lock.last_save_timestamp_ms = now;
        state_lock.last_save_path = Some(canonical.to_string_lossy().to_string());
    }

    Ok(format!("Guardado exitoso en: {}", canonical.display()))
}

#[tauri::command]
pub fn obtener_lienzo_png(state: tauri::State<'_, Arc<RwLock<AppState>>>) -> Result<Vec<u8>, String> {
    // Read-only: composes canvas PNG for display.
    // No file I/O — returns bytes directly to frontend, safe from path traversal.
    let state_lock = state.read();

    let width = state_lock.canvas_width;
    let height = state_lock.canvas_height;

    let mut master_pixmap = Pixmap::new(width, height).ok_or("Error memoria")?;
    master_pixmap.fill(Color::TRANSPARENT);

    for layer in state_lock.layers.iter() {
        if !layer.visible || layer.opacity <= 0.0 { continue; }

        let buffer = layer.buffer.read();
        let mut paint = PixmapPaint::default();
        paint.opacity = layer.opacity;

        master_pixmap.draw_pixmap(
            layer.x as i32, layer.y as i32,
            buffer.as_ref(),
            &paint,
            Transform::identity(),
            None,
        );
    }

    master_pixmap.encode_png().map_err(|e| format!("Error PNG: {}", e))
}

#[tauri::command]
pub fn obtener_mascara_png(state: tauri::State<'_, Arc<RwLock<AppState>>>) -> Result<Vec<u8>, String> {
    // Read-only: generates mask PNG for display.
    // No file I/O — returns bytes directly to frontend, safe from path traversal.
    // Fixed: was using Mutex<AppState> but AppState uses RwLock — now consistent.
    let state_lock = state.read();

    let active_id = &state_lock.active_layer_id;
    let layer = state_lock.layers.iter().find(|l| l.id == *active_id).ok_or("Capa no activa")?;

    let pixmap = layer.buffer.read();
    let width = pixmap.width();
    let height = pixmap.height();

    let mut mask_pixmap = Pixmap::new(width, height).ok_or("Error memoria")?;

    let src_data = pixmap.data();
    let mask_data = mask_pixmap.data_mut();

    for i in 0..(src_data.len() / 4) {
        let alpha = src_data[i * 4 + 3];

        if alpha > 0 {
            mask_data[i * 4] = 255;
            mask_data[i * 4 + 1] = 255;
            mask_data[i * 4 + 2] = 255;
            mask_data[i * 4 + 3] = 255;
        } else {
            mask_data[i * 4] = 0;
            mask_data[i * 4 + 1] = 0;
            mask_data[i * 4 + 2] = 0;
            mask_data[i * 4 + 3] = 255;
        }
    }

    mask_pixmap.encode_png().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cargar_png_en_capa(state: State<'_, Arc<RwLock<AppState>>>, id: String, png_bytes: Vec<u8>) -> Result<(), String> {
    if png_bytes.len() > MAX_PNG_SIZE_BYTES {
        return Err(format!("Imagen demasiado grande ({} MB). Límite: {} MB.",
            png_bytes.len() / (1024 * 1024), MAX_PNG_SIZE_BYTES / (1024 * 1024)));
    }
    let mut state_lock = state.write();

    if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id) {
        let decoded_pixmap = Pixmap::decode_png(&png_bytes).map_err(|e| e.to_string())?;
        let mut pixmap = layer.buffer.write();
        *pixmap = decoded_pixmap;
        Ok(())
    } else {
        Err("Capa no encontrada".to_string())
    }
}

/// Helper para verificar si un path canonicalizado apunta a directorios de sistema sensibles/inseguros.
fn es_ruta_sistema_insegura(path: &std::path::Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();
    
    // Lista de patrones de directorios críticos de sistema a bloquear
    let patrones_bloqueados = [
        r"\windows\",
        r"\program files\",
        r"\program files (x86)\",
        r"\programdata\",
        r"\appdata\",
        r"\system volume information\",
        r"\$recycle.bin\",
        "/etc/",
        "/var/",
        "/bin/",
        "/sbin/",
        "/usr/",
        "/sys/",
        "/proc/",
        "/boot/",
        "/dev/",
        "/root/",
        "/lib/",
        "/lib64/",
        "/system/",
        "/library/",
    ];

    for patron in &patrones_bloqueados {
        if path_str.contains(patron) {
            return true;
        }
    }

    // Verificar si la ruta entera es exactamente o termina en rutas de sistema sensibles
    let rutas_exactas = [
        "c:\\windows",
        "c:\\program files",
        "c:\\program files (x86)",
        "c:\\programdata",
        "/etc",
        "/var",
        "/bin",
        "/sbin",
        "/usr",
        "/sys",
        "/proc",
        "/boot",
        "/dev",
        "/root",
        "/lib",
        "/lib64",
        "/system",
        "/library",
    ];

    for ruta in &rutas_exactas {
        if path_str == *ruta 
            || path_str.ends_with(&format!("\\{}", ruta)) 
            || path_str.ends_with(&format!("/{}", ruta)) 
        {
            return true;
        }
    }

    false
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/LayerMetadataDto.ts")]
pub struct LayerMetadataDto {
    pub id: String,
    pub name: String,
    pub opacity: f32,
    pub visible: bool,
    pub locked: bool,
    pub x: f32,
    pub y: f32,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/CanvasMetadataDto.ts")]
pub struct CanvasMetadataDto {
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub active_layer_id: String,
    pub version: String,
    pub layers: Vec<LayerMetadataDto>,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/ProyectoBrickResponse.ts")]
pub struct ProyectoBrickResponse {
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub active_layer_id: String,
    pub version: String,
    pub layers: Vec<LayerMetadataDto>,
    #[ts(type = "Record<string, Uint8Array>")]
    pub raw_buffers: HashMap<String, Vec<u8>>,
}

/// Tabla LUT precargada en tiempo de compilación (Const Evaluation) para des-premultiplicación rápida.
/// Representa (255 * 65536) / alpha para cada valor posible de alpha (1-255).
const UNPREMULTIPLY_LUT: [u32; 256] = {
    let mut lut = [0u32; 256];
    let mut i = 1;
    while i < 256 {
        lut[i] = ((255 * 65536) / i) as u32;
        i += 1;
    }
    lut
};

/// Des-premultiplica bytes en formato RGBA Premultiplicado a Straight RGBA de forma vectorial y optimizada.
/// Reemplaza divisiones enteras de CPU por multiplicación de punto fijo de 16 bits y bit-shifts.
/// Decorada con #[inline] para habilitar vectorización SIMD automática (SSE/AVX) por parte del compilador.
#[inline]
pub fn unpremultiply_pixels(premultiplied: &[u8]) -> Vec<u8> {
    let mut straight = vec![0u8; premultiplied.len()];
    
    // El compilador puede vectorizar este bucle linealmente al no poseer dependencias entre iteraciones.
    for i in (0..premultiplied.len()).step_by(4) {
        let r = premultiplied[i] as u32;
        let g = premultiplied[i + 1] as u32;
        let b = premultiplied[i + 2] as u32;
        let a = premultiplied[i + 3] as usize;
        
        if a == 0 {
            straight[i] = 0;
            straight[i + 1] = 0;
            straight[i + 2] = 0;
            straight[i + 3] = 0;
        } else {
            let mult = UNPREMULTIPLY_LUT[a];
            straight[i] = ((r * mult + 32768) >> 16) as u8;
            straight[i + 1] = ((g * mult + 32768) >> 16) as u8;
            straight[i + 2] = ((b * mult + 32768) >> 16) as u8;
            straight[i + 3] = a as u8;
        }
    }
    straight
}

#[tauri::command]
pub fn guardar_proyecto_brick(
    state: State<'_, Arc<RwLock<AppState>>>,
    ruta: String,
    metadata: CanvasMetadataDto,
) -> Result<String, String> {
    // ── CAPAS 1, 2, 3: Validación contra Path Traversal, raíces de disco y carpetas críticas ──
    let path = std::path::Path::new(&ruta);
    if !path.is_absolute() {
        return Err("Seguridad: La ruta debe ser absoluta.".to_string());
    }
    for component in path.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Seguridad: Intento de Path Traversal (../) detectado y denegado.".to_string());
        }
    }
    if path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase() != "brick" {
        return Err("Seguridad: Operación denegada. Solo se permite extensión .brick.".to_string());
    }
    let canonical = path.canonicalize()
        .map_err(|e| e.to_string())
        .or_else(|_| {
            let parent = path.parent()
                .ok_or_else(|| "Seguridad: Ruta sin directorio padre válido.".to_string())?;
            let file_name = path.file_name()
                .ok_or_else(|| "Seguridad: Ruta sin nombre de archivo.".to_string())?;
            parent.canonicalize()
                .map_err(|e| format!("Seguridad: No se pudo canonicalizar: {}", e))
                .map(|p| p.join(file_name))
        })?;

    let parent = canonical.parent()
        .ok_or_else(|| "Seguridad: La ruta debe poseer un directorio padre válido.".to_string())?;
    if parent.components().count() <= 1 {
        return Err("Seguridad: No se permite guardar archivos directamente en la raíz de ninguna unidad.".to_string());
    }
    if es_ruta_sistema_insegura(&canonical) {
        return Err("Seguridad: Operación denegada. No se permite escribir en directorios del sistema operativo por razones de seguridad.".to_string());
    }

    // ── CAPA 4: Rate Limiting ──
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Error de tiempo: {}", e))?
        .as_millis();
    {
        let state_lock = state.read();
        let elapsed = now.saturating_sub(state_lock.last_save_timestamp_ms);
        if elapsed < MIN_SAVE_INTERVAL_MS {
            return Err(format!(
                "Rate limit: Espera {} ms entre guardados.",
                MIN_SAVE_INTERVAL_MS.saturating_sub(elapsed)
            ));
        }
    }

    // ── Opciones de compresión Deflate al máximo para los bytes crudos ──
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(9));

    // ── Sincronizar metadatos con el AppState real en Rust (fuente de verdad definitiva) ──
    let mut metadata = metadata;
    let state_lock = state.read();
    metadata.canvas_width = state_lock.canvas_width;
    metadata.canvas_height = state_lock.canvas_height;
    metadata.active_layer_id = state_lock.active_layer_id.clone();

    for layer_meta in &mut metadata.layers {
        if let Some(layer) = state_lock.layers.iter().find(|l| l.id == layer_meta.id) {
            let buffer_lock = layer.buffer.read();
            layer_meta.width = buffer_lock.width();
            layer_meta.height = buffer_lock.height();
            layer_meta.x = layer.x;
            layer_meta.y = layer.y;
            layer_meta.opacity = layer.opacity;
            layer_meta.visible = layer.visible;
        }
    }

    // ── Guardado ATÓMICO: escribimos el ZIP a un temporal hermano (mismo volumen), hacemos
    //    sync_all y luego rename sobre el destino. Si algo falla a mitad (disco lleno, capa
    //    faltante, crash), el .brick PREVIO queda intacto y el temporal se borra. Antes se
    //    creaba el archivo destino directamente y un fallo lo dejaba corrupto/truncado. ──
    let tmp_path = temp_sibling(&canonical)?;
    let write_result = (|| -> Result<(), String> {
        let file = std::fs::File::create(&tmp_path)
            .map_err(|e| format!("Error al crear el archivo temporal de proyecto: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);

        // ── Escribir manifiesto canvas.json ──
        zip.start_file("canvas.json", options)
            .map_err(|e| format!("Error al iniciar archivo canvas.json en el contenedor: {}", e))?;
        let json_data = serde_json::to_string_pretty(&metadata)
            .map_err(|e| format!("Error al serializar metadatos del proyecto: {}", e))?;
        zip.write_all(json_data.as_bytes())
            .map_err(|e| format!("Error al escribir metadatos en canvas.json: {}", e))?;

        // ── Escribir capas nativas como bytes puros .raw ──
        for layer_meta in &metadata.layers {
            if let Some(layer) = state_lock.layers.iter().find(|l| l.id == layer_meta.id) {
                let buffer_lock = layer.buffer.read();
                let file_name = format!("layer_{}.raw", layer.id);
                zip.start_file(&file_name, options)
                    .map_err(|e| format!("Error al iniciar archivo de capa '{}' en el contenedor: {}", layer.id, e))?;
                zip.write_all(buffer_lock.data())
                    .map_err(|e| format!("Error al escribir bytes crudos de la capa '{}': {}", layer.id, e))?;
            } else {
                return Err(format!("Error: Capa '{}' no encontrada en el motor gráfico de Rust.", layer_meta.id));
            }
        }

        let finished = zip
            .finish()
            .map_err(|e| format!("Error al finalizar y empaquetar el archivo .brick: {}", e))?;
        finished
            .sync_all()
            .map_err(|e| format!("Error al sincronizar el .brick a disco: {}", e))?;
        Ok(())
    })();

    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }
    if let Err(e) = std::fs::rename(&tmp_path, &canonical) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Error al confirmar el guardado atómico (rename): {}", e));
    }

    drop(state_lock);
    {
        let mut state_lock = state.write();
        state_lock.last_save_timestamp_ms = now;
        state_lock.last_save_path = Some(canonical.to_string_lossy().to_string());
    }

    Ok(format!("Proyecto guardado con éxito en: {}", canonical.display()))
}

#[tauri::command]
pub fn cargar_proyecto_brick(
    state: State<'_, Arc<RwLock<AppState>>>,
    ruta: String,
) -> Result<ProyectoBrickResponse, String> {
    // ── Validación de ruta y extensión .brick ──
    let path = std::path::Path::new(&ruta);
    if !path.is_absolute() {
        return Err("Seguridad: La ruta debe ser absoluta.".to_string());
    }
    for component in path.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Seguridad: Intento de Path Traversal (../) detectado y denegado.".to_string());
        }
    }
    if path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase() != "brick" {
        return Err("Seguridad: Operación denegada. Solo se permite extensión .brick.".to_string());
    }
    let canonical = path.canonicalize()
        .map_err(|e| format!("Error al abrir archivo de proyecto: {}", e))?;

    // ── Abrir el contenedor ZIP ──
    let file = std::fs::File::open(&canonical)
        .map_err(|e| format!("Error al abrir el archivo físico: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Error al leer contenedor de capas .brick: {}", e))?;

    // ── Leer canvas.json ──
    let metadata: CanvasMetadataDto = {
        let mut canvas_file = archive.by_name("canvas.json")
            .map_err(|e| format!("Manifiesto canvas.json no encontrado en el archivo de proyecto: {}", e))?;
        
        // Seguridad: acotar la lectura del manifiesto inflado (antes era ilimitada → bomba en el JSON).
        let mut json_content = String::new();
        let bytes_read = canvas_file
            .take(MAX_CANVAS_JSON_BYTES)
            .read_to_string(&mut json_content)
            .map_err(|e| format!("Error al leer contenido de canvas.json: {}", e))?;
        if bytes_read as u64 >= MAX_CANVAS_JSON_BYTES {
            return Err(
                "Seguridad: canvas.json excede el límite permitido (posible archivo malicioso)."
                    .to_string(),
            );
        }
        serde_json::from_str(&json_content)
            .map_err(|e| format!("Error al deserializar manifiesto de capas: {}", e))?
    };


    // ── Decodificar TODAS las capas en LOCALES, SIN tomar el lock (validate-before-mutate) ──
    // Una carga rechazada/corrupta (bomba, dimensiones absurdas) NUNCA debe borrar el proyecto
    // actual: antes master tomaba el write lock y hacía layers.clear() ANTES de leer las capas, así
    // que un .brick malicioso dejaba el lienzo vacío aunque la carga fallara. Ahora construimos
    // new_layers en local y solo al terminar OK hacemos un swap atómico.
    let mut new_layers: Vec<crate::state::NativeLayer> = Vec::with_capacity(metadata.layers.len());
    let mut raw_buffers = HashMap::new();
    // Acumulador para el tope total anti-bomba de descompresión.
    let mut total_raw: usize = 0;

    // ── Reconstruir cada capa desde los bytes crudos .raw ──
    for layer_meta in &metadata.layers {
        let file_name = format!("layer_{}.raw", layer_meta.id);
        let mut layer_file = archive.by_name(&file_name)
            .map_err(|e| format!("Datos gráficos de capa '{}' no encontrados en el proyecto: {}", file_name, e))?;

        // Seguridad: rechazar dimensiones absurdas ANTES de reservar memoria (evita overflow/OOM).
        if layer_meta.width > MAX_DIMENSION || layer_meta.height > MAX_DIMENSION {
            return Err(format!(
                "Seguridad: dimensiones de la capa '{}' fuera de límite ({}x{}, máx {}).",
                layer_meta.id, layer_meta.width, layer_meta.height, MAX_DIMENSION
            ));
        }
        let w = if layer_meta.width == 0 { 1 } else { layer_meta.width };
        let h = if layer_meta.height == 0 { 1 } else { layer_meta.height };
        // Tamaño esperado con multiplicación CHEQUEADA (sin wrap de enteros que daría un buffer chico).
        let expected_size = (w as usize)
            .checked_mul(h as usize)
            .and_then(|n| n.checked_mul(4))
            .ok_or_else(|| format!("Seguridad: el tamaño de la capa '{}' desborda.", layer_meta.id))?;

        // Tope total acumulado: frena una bomba compuesta por muchas capas grandes.
        total_raw = total_raw.saturating_add(expected_size);
        if total_raw > MAX_TOTAL_RAW_BYTES {
            return Err(
                "Seguridad: el proyecto excede el límite total de píxeles (posible bomba de descompresión)."
                    .to_string(),
            );
        }

        // Lectura ACOTADA: leemos como mucho expected_size+1 bytes inflados. Si la entrada infla MÁS
        // de lo declarado en los metadatos, es una bomba → rechazar. Si infla menos, se rellena
        // (misma resiliencia que antes). Antes era un read_to_end ilimitado → riesgo de OOM.
        let mut raw_bytes = Vec::new();
        layer_file
            .take(expected_size as u64 + 1)
            .read_to_end(&mut raw_bytes)
            .map_err(|e| format!("Error leyendo bytes gráficos de la capa '{}': {}", layer_meta.id, e))?;

        if raw_bytes.len() > expected_size {
            return Err(format!(
                "Seguridad: la capa '{}' infla más de lo declarado (posible bomba de descompresión).",
                layer_meta.id
            ));
        }
        if raw_bytes.len() < expected_size {
            raw_bytes.resize(expected_size, 0);
        }

        // Recrear Pixmap nativo
        let int_size = tiny_skia::IntSize::from_wh(w, h)
            .ok_or_else(|| format!("Dimensiones inválidas al reconstruir capa '{}'.", layer_meta.id))?;
        
        let pixmap = Pixmap::from_vec(raw_bytes.clone(), int_size)
            .ok_or_else(|| format!("Error de formato al reconstruir buffer de capa '{}'.", layer_meta.id))?;

        // Insertar en capas activas de Rust
        let native_layer = crate::state::NativeLayer {
            id: layer_meta.id.clone(),
            opacity: layer_meta.opacity,
            visible: layer_meta.visible,
            x: layer_meta.x,
            y: layer_meta.y,
            buffer: Arc::new(RwLock::new(pixmap)),
            texture: None,
        };
        new_layers.push(native_layer);

        // Des-premultiplicación ultra veloz nativa con LUT y shifts de bits
        let straight_rgba = unpremultiply_pixels(&raw_bytes);
        raw_buffers.insert(layer_meta.id.clone(), straight_rgba);
    }

    // ── Cutover ATÓMICO: una sola escritura corta intercambia las capas y resetea el historial.
    //    Como new_layers ya está totalmente decodificado y validado, una carga fallida jamás llega
    //    hasta aquí → el proyecto previo del usuario queda intacto ante un error. ──
    {
        let mut state_lock = state.write();
        state_lock.history.undo_stack.clear();
        state_lock.history.redo_stack.clear();
        state_lock.canvas_width = metadata.canvas_width;
        state_lock.canvas_height = metadata.canvas_height;
        state_lock.active_layer_id = metadata.active_layer_id.clone();
        state_lock.layers = new_layers;
    }

    Ok(ProyectoBrickResponse {
        canvas_width: metadata.canvas_width,
        canvas_height: metadata.canvas_height,
        active_layer_id: metadata.active_layer_id,
        version: metadata.version,
        layers: metadata.layers,
        raw_buffers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;
    use crate::commands::layers::{anadir_capa, cambiar_opacidad_capa};
    use crate::commands::draw::{procesar_trazo, PuntoTrazo};

    fn preparar_directorio_prueba(base: std::path::PathBuf) -> Result<std::path::PathBuf, String> {
        if es_ruta_sistema_insegura(&base) {
            return Err(format!("Ruta de prueba bloqueada por seguridad: {}", base.display()));
        }

        std::fs::create_dir_all(&base)
            .map_err(|e| format!("No se pudo crear el directorio de prueba '{}': {}", base.display(), e))?;

        let canonical = base
            .canonicalize()
            .map_err(|e| format!("No se pudo canonicalizar el directorio de prueba '{}': {}", base.display(), e))?;

        if es_ruta_sistema_insegura(&canonical) {
            return Err(format!("Ruta de prueba canonicalizada bloqueada por seguridad: {}", canonical.display()));
        }

        Ok(canonical)
    }

    fn ruta_proyecto_prueba(file_name: &str) -> std::path::PathBuf {
        if let Some(base) = std::env::var_os("BRICK_DRAW_TEST_OUTPUT_DIR") {
            if let Ok(base) = preparar_directorio_prueba(std::path::PathBuf::from(base)) {
                return base.join(file_name);
            }
        }

        let candidate = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("test-output");

        if let Ok(base) = preparar_directorio_prueba(candidate) {
            return base.join(file_name);
        }

        #[cfg(windows)]
        let fallback_base = std::env::var_os("USERPROFILE")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::env::current_dir().unwrap())
            .join("Documents")
            .join("brick-draw-test");

        #[cfg(not(windows))]
        let fallback_base = std::env::temp_dir().join("brick-draw-test");

        preparar_directorio_prueba(fallback_base)
            .expect("No se pudo preparar una ruta segura para el test")
            .join(file_name)
    }

    fn mock_state<'a, T: Send + Sync + 'static>(val: &'a T) -> State<'a, T> {
        unsafe { std::mem::transmute(val) }
    }

    #[test]
    fn test_guardar_y_cargar_proyecto_brick() {
        let state = Arc::new(RwLock::new(AppState::new()));
        let state_guard = mock_state(&state);

        // 1. Agregar dos capas de prueba
        anadir_capa(state_guard.clone(), "capa_a".to_string(), 128, 128).unwrap();
        anadir_capa(state_guard.clone(), "capa_b".to_string(), 128, 128).unwrap();
        cambiar_opacidad_capa(state_guard.clone(), "capa_b".to_string(), 0.5).unwrap();

        // 2. Pintar algo en las capas para tener datos gráficos reales
        let puntos_a = vec![
            PuntoTrazo { x: 10.0, y: 10.0, p: 1.0 },
            PuntoTrazo { x: 50.0, y: 50.0, p: 1.0 },
        ];
        procesar_trazo(
            state_guard.clone(),
            "capa_a".to_string(),
            puntos_a,
            "brush".to_string(),
            "#ff0000".to_string(),
            8.0,
            1.0,
        ).unwrap();

        let puntos_b = vec![
            PuntoTrazo { x: 30.0, y: 30.0, p: 1.0 },
            PuntoTrazo { x: 90.0, y: 90.0, p: 1.0 },
        ];
        procesar_trazo(
            state_guard.clone(),
            "capa_b".to_string(),
            puntos_b,
            "brush".to_string(),
            "#0000ff".to_string(),
            6.0,
            0.5,
        ).unwrap();

        // Obtener buffers dibujados originales de una sola línea para evitar borrows persistentes
        let pixels_a_original = state.read().layers.iter().find(|l| l.id == "capa_a").unwrap().buffer.read().data().to_vec();
        let pixels_b_original = state.read().layers.iter().find(|l| l.id == "capa_b").unwrap().buffer.read().data().to_vec();

        // 3. Preparar metadata del proyecto dinámicamente según el estado de Rust
        let state_read = state.read();
        let layer_a = state_read.layers.iter().find(|l| l.id == "capa_a").unwrap();
        let layer_b = state_read.layers.iter().find(|l| l.id == "capa_b").unwrap();
        
        let metadata = CanvasMetadataDto {
            canvas_width: 128,
            canvas_height: 128,
            active_layer_id: "capa_b".to_string(),
            version: "1.0.0".to_string(),
            layers: vec![
                LayerMetadataDto {
                    id: "capa_a".to_string(),
                    name: "Capa A".to_string(),
                    opacity: 1.0,
                    visible: true,
                    locked: false,
                    x: layer_a.x,
                    y: layer_a.y,
                    width: layer_a.buffer.read().width(),
                    height: layer_a.buffer.read().height(),
                },
                LayerMetadataDto {
                    id: "capa_b".to_string(),
                    name: "Capa B".to_string(),
                    opacity: 0.5,
                    visible: true,
                    locked: true,
                    x: layer_b.x,
                    y: layer_b.y,
                    width: layer_b.buffer.read().width(),
                    height: layer_b.buffer.read().height(),
                },
            ],
        };
        drop(state_read);

        // Crear una ruta absoluta segura de prueba sin debilitar la política productiva.
        let project_path = ruta_proyecto_prueba("test_project_layers.brick");
        let project_dir = project_path.parent().map(|path| path.to_path_buf());
        let project_path_str = project_path.to_string_lossy().to_string();

        // 4. Guardar proyecto
        let save_res = guardar_proyecto_brick(
            state_guard.clone(),
            project_path_str.clone(),
            metadata
        ).unwrap();
        assert!(save_res.contains("Proyecto guardado con éxito"));

        // Validar que el archivo físico fue creado
        assert!(project_path.exists());

        // 5. Cargar proyecto (reconstrucción y limpieza de historial)
        let load_res = cargar_proyecto_brick(
            state_guard.clone(),
            project_path_str.clone()
        ).unwrap();

        // Validaciones generales del DTO cargado
        assert_eq!(load_res.canvas_width, 128);
        assert_eq!(load_res.canvas_height, 128);
        assert_eq!(load_res.active_layer_id, "capa_b");
        assert_eq!(load_res.layers.len(), 2);
        
        let l_a_meta = load_res.layers.iter().find(|l| l.id == "capa_a").unwrap();
        assert_eq!(l_a_meta.name, "Capa A");
        assert_eq!(l_a_meta.locked, false);
        
        let l_b_meta = load_res.layers.iter().find(|l| l.id == "capa_b").unwrap();
        assert_eq!(l_b_meta.name, "Capa B");
        assert_eq!(l_b_meta.opacity, 0.5);
        assert_eq!(l_b_meta.locked, true);

        // Validar que el AppState en Rust fue reconstruido perfectamente
        let state_read = state.read();
        assert_eq!(state_read.canvas_width, 128);
        assert_eq!(state_read.canvas_height, 128);
        assert_eq!(state_read.layers.len(), 2);
        
        // El historial en Rust debe estar vacío
        assert_eq!(state_read.history.undo_stack.len(), 0);
        assert_eq!(state_read.history.redo_stack.len(), 0);

        let rebuilt_l_a = state_read.layers.iter().find(|l| l.id == "capa_a").unwrap();
        let rebuilt_l_b = state_read.layers.iter().find(|l| l.id == "capa_b").unwrap();

        // Validar igualdad de píxeles puros reconstruidos en memoria
        assert_eq!(pixels_a_original, rebuilt_l_a.buffer.read().data().to_vec());
        assert_eq!(pixels_b_original, rebuilt_l_b.buffer.read().data().to_vec());

        // Validar que los buffers des-premultiplicados devueltos para el frontend no estén corruptos
        let straight_a_bytes = load_res.raw_buffers.get("capa_a").unwrap();
        let straight_b_bytes = load_res.raw_buffers.get("capa_b").unwrap();
        let expected_size_a = rebuilt_l_a.buffer.read().data().len();
        let expected_size_b = rebuilt_l_b.buffer.read().data().len();
        assert_eq!(straight_a_bytes.len(), expected_size_a);
        assert_eq!(straight_b_bytes.len(), expected_size_b);

        // 6. Limpiar archivo físico temporal
        std::fs::remove_file(&project_path).unwrap();
        if let Some(project_dir) = project_dir {
            let _ = std::fs::remove_dir(project_dir);
        }
        println!("✅ Test de integración de Guardado y Carga de proyectos .brick superado con éxito.");
    }

    /// Seguridad: un .brick con dimensiones de capa absurdas (bomba de descompresión / OOM) debe
    /// rechazarse, Y la carga rechazada NO debe borrar el proyecto que el usuario ya tenía abierto
    /// (validate-before-mutate). Cubre el cap MAX_DIMENSION + el cutover atómico.
    #[test]
    fn cargar_rechaza_dimensiones_absurdas_sin_borrar_estado() {
        use std::io::Write as _;

        let state = Arc::new(RwLock::new(AppState::new()));
        let guard = mock_state(&state);

        // Proyecto previo del usuario: una capa real que NO se debe perder si la carga se rechaza.
        anadir_capa(guard.clone(), "original".to_string(), 32, 32).unwrap();

        // Construir un .brick malicioso: metadatos declaran una capa de 70000x70000 (> MAX_DIMENSION).
        let dir = std::env::current_dir().unwrap();
        let path = dir.join("test_bomba_dims.brick");
        {
            let f = std::fs::File::create(&path).unwrap();
            let mut zipw = zip::ZipWriter::new(f);
            let opts = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            let canvas_json = r#"{"canvas_width":64,"canvas_height":64,"active_layer_id":"mal","version":"1.0.0","layers":[{"id":"mal","name":"M","opacity":1.0,"visible":true,"locked":false,"x":0.0,"y":0.0,"width":70000,"height":70000}]}"#;
            zipw.start_file("canvas.json", opts).unwrap();
            zipw.write_all(canvas_json.as_bytes()).unwrap();
            zipw.start_file("layer_mal.raw", opts).unwrap();
            zipw.write_all(&[0u8; 16]).unwrap();
            zipw.finish().unwrap();
        }

        let res = cargar_proyecto_brick(guard.clone(), path.to_string_lossy().to_string());
        let _ = std::fs::remove_file(&path);

        assert!(res.is_err(), "una capa de 70000x70000 debe ser rechazada (cap MAX_DIMENSION)");

        // El proyecto previo NO debe haberse borrado por una carga rechazada.
        let s = state.read();
        assert_eq!(s.layers.len(), 1, "la carga rechazada no debe borrar el estado previo");
        assert_eq!(s.layers[0].id, "original", "la capa previa del usuario debe seguir intacta");
    }
}



