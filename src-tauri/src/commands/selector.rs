use std::sync::Arc;
use parking_lot::RwLock;
use tiny_skia::{Pixmap, PremultipliedColorU8, Transform, PixmapPaint};

use crate::state::{AppState, HistoryOp};

/// Maximum canvas dimension for flood fill — prevents OOM attacks
const MAX_FLOOD_FILL_DIMENSION: u32 = 8192;

fn color_distance(c1: PremultipliedColorU8, c2: PremultipliedColorU8) -> f32 {
    let r_diff = c1.red() as f32 - c2.red() as f32;
    let g_diff = c1.green() as f32 - c2.green() as f32;
    let b_diff = c1.blue() as f32 - c2.blue() as f32;
    let a_diff = c1.alpha() as f32 - c2.alpha() as f32;
    
    (r_diff * r_diff + g_diff * g_diff + b_diff * b_diff + a_diff * a_diff).sqrt()
}

#[tauri::command]
pub fn calcular_seleccion_varita(
    state: tauri::State<'_, Arc<RwLock<AppState>>>,
    id_capa: String,
    start_x: u32,
    start_y: u32,
    tolerancia: f32,
) -> Result<Vec<u8>, String> {
    calcular_seleccion_varita_core(state.inner(), id_capa, start_x, start_y, tolerancia)
}

// honest-concurrency-tests (CONC-5): plain core fn over `&Arc<RwLock<AppState>>` so tests drive it
// with a real Arc (no transmute). The `#[tauri::command]` wrapper is just the IPC boundary.
pub fn calcular_seleccion_varita_core(
    state: &Arc<RwLock<AppState>>,
    id_capa: String,
    start_x: u32,
    start_y: u32,
    tolerancia: f32,
) -> Result<Vec<u8>, String> {
    let tolerancia = tolerancia.max(0.0).min(255.0);

    let global_mask = {
        let state_lock = state.read();
        let canvas_w = state_lock.canvas_width;
        let canvas_h = state_lock.canvas_height;

        if start_x >= canvas_w || start_y >= canvas_h {
            return Err("Clic fuera del lienzo".to_string());
        }

        if canvas_w > MAX_FLOOD_FILL_DIMENSION || canvas_h > MAX_FLOOD_FILL_DIMENSION {
            return Err("Lienzo demasiado grande para selección".to_string());
        }
        
        let layer = state_lock.layers.iter().find(|l| l.id == id_capa).ok_or("Capa no encontrada")?;
        let pixmap = layer.buffer.read();

        let mut global_layer = Pixmap::new(canvas_w, canvas_h)
            .ok_or("Error reservando memoria para selección")?;
        global_layer.draw_pixmap(
            layer.x as i32, 
            layer.y as i32, 
            pixmap.as_ref(), 
            &PixmapPaint::default(), 
            Transform::identity(), 
            None
        );

        let target_color = global_layer.pixel(start_x, start_y)
            .ok_or("No se pudo leer el color del pixel")?;
        let max_distance = tolerancia * 510.0;
        
        let mut mask_pixmap = Pixmap::new(canvas_w, canvas_h)
            .ok_or("Error reservando memoria para máscara")?;
        let mut visited = vec![false; (canvas_w * canvas_h) as usize];
        let mut mask = vec![false; (canvas_w * canvas_h) as usize];
        let mut stack = Vec::with_capacity(10000);
        
        stack.push((start_x, start_y));

        while let Some((cx, cy)) = stack.pop() {
            let idx = (cy * canvas_w + cx) as usize;
            
            if visited[idx] { continue; }
            visited[idx] = true;

            if let Some(current_color) = global_layer.pixel(cx, cy) {
                if color_distance(target_color, current_color) <= max_distance {
                    mask[idx] = true;
                    
                    if cx > 0 { stack.push((cx - 1, cy)); }
                    if cx < canvas_w - 1 { stack.push((cx + 1, cy)); }
                    if cy > 0 { stack.push((cx, cy - 1)); }
                    if cy < canvas_h - 1 { stack.push((cx, cy + 1)); }
                }
            }
        }

        let pixels = mask_pixmap.pixels_mut();
        let mask_color = PremultipliedColorU8::from_rgba(255, 255, 255, 255)
            .ok_or("Error creando color de máscara")?;
        for i in 0..pixels.len() {
            if mask[i] { pixels[i] = mask_color; }
        }

        mask_pixmap
    };

    {
        let mut state_lock_mut = state.write();
        // Record the selection change as an inverse-capable op (prev mask -> new mask).
        let prev_mask = state_lock_mut.active_selection.clone();
        let next_mask = Some(global_mask.clone());
        state_lock_mut.active_selection = next_mask.clone();
        state_lock_mut.history.record(HistoryOp::Selection { prev_mask, next_mask });
    }

    match global_mask.encode_png() {
        Ok(bytes) => Ok(bytes),
        Err(e) => Err(format!("Error codificando máscara: {}", e))
    }
}
