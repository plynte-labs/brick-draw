// src-tauri/src/commands/history.rs
use crate::state::{AppState, HistoryDiff};
use std::sync::Arc;
use parking_lot::RwLock;
use tauri::State;
use tiny_skia::Pixmap;

fn extract_region(pixmap: &Pixmap, x: u32, y: u32, w: u32, h: u32) -> Option<Vec<u8>> {
    if w == 0 || h == 0 { return None; }
    if x + w > pixmap.width() || y + h > pixmap.height() { return None; }
    
    let mut pixels = Vec::with_capacity((w * h * 4) as usize);
    for dy in 0..h {
        let row_start = ((y + dy) as usize * pixmap.width() as usize + x as usize) * 4;
        let row_end = row_start + w as usize * 4;
        pixels.extend_from_slice(&pixmap.data()[row_start..row_end]);
    }
    Some(pixels)
}

fn restore_region(pixmap: &mut Pixmap, x: u32, y: u32, w: u32, h: u32, pixels: &[u8]) {
    if w == 0 || h == 0 { return; }
    if pixels.len() != (w * h * 4) as usize { return; }
    
    let pw = pixmap.width();
    let ph = pixmap.height();
    
    let dest_data = pixmap.data_mut();
    for dy in 0..h {
        let dest_y = y + dy;
        if dest_y >= ph { break; }
        let dest_row = (dest_y as usize * pw as usize + x as usize) * 4;
        let src_row = (dy as usize * w as usize) * 4;
        let row_len = w as usize * 4;
        let dest_end = dest_row + row_len;
        let src_end = src_row + row_len;
        if dest_end <= dest_data.len() && src_end <= pixels.len() {
            dest_data[dest_row..dest_end].copy_from_slice(&pixels[src_row..src_end]);
        }
    }
}

fn capture_for_redo(
    diff: &HistoryDiff,
    current_layer_x: f32,
    current_layer_y: f32,
    pixmap: &Pixmap,
) -> Option<HistoryDiff> {
    let dx = (diff.layer_x_at_snapshot - current_layer_x) as i32;
    let dy = (diff.layer_y_at_snapshot - current_layer_y) as i32;
    
    let target_x = (diff.x as i32 + dx).max(0) as u32;
    let target_y = (diff.y as i32 + dy).max(0) as u32;
    
    let w = diff.width.min(pixmap.width().saturating_sub(target_x));
    let h = diff.height.min(pixmap.height().saturating_sub(target_y));
    
    if let Some(pixels) = extract_region(pixmap, target_x, target_y, w, h) {
        Some(HistoryDiff {
            layer_id: diff.layer_id.clone(),
            x: target_x,
            y: target_y,
            width: w,
            height: h,
            pixels,
            layer_x_at_snapshot: current_layer_x,
            layer_y_at_snapshot: current_layer_y,
        })
    } else {
        None
    }
}

#[tauri::command]
pub fn deshacer(state: State<'_, Arc<RwLock<AppState>>>) -> Result<Option<String>, String> {
    deshacer_core(state.inner())
}

// honest-concurrency-tests (CONC-5): plain core fns over `&Arc<RwLock<AppState>>` so tests drive
// them with a real Arc (no transmute). The `#[tauri::command]` wrappers are just the IPC boundary.
pub fn deshacer_core(state: &Arc<RwLock<AppState>>) -> Result<Option<String>, String> {
    // Write: modifies history stacks and layer buffer
    let mut state_lock = state.write();
    let app_state = &mut *state_lock;
    let history = &mut app_state.history;
    let layers = &mut app_state.layers;

    if let Some(past_diff) = history.undo_stack.pop() {
        if let Some(layer) = layers.iter_mut().find(|l| l.id == past_diff.layer_id) {
            let mut pixmap = layer.buffer.write();
            
            if let Some(redo_diff) = capture_for_redo(&past_diff, layer.x, layer.y, &pixmap) {
                history.redo_stack.push(redo_diff);
            }
            
            let dx = (past_diff.layer_x_at_snapshot - layer.x) as i32;
            let dy = (past_diff.layer_y_at_snapshot - layer.y) as i32;
            
            let target_x = (past_diff.x as i32 + dx).max(0) as u32;
            let target_y = (past_diff.y as i32 + dy).max(0) as u32;
            
            let w = past_diff.width.min(pixmap.width().saturating_sub(target_x));
            let h = past_diff.height.min(pixmap.height().saturating_sub(target_y));
            
            if w > 0 && h > 0 {
                let mut clipped_pixels = Vec::with_capacity((w * h * 4) as usize);
                for dy in 0..h {
                    let src_row = (dy * past_diff.width + (target_x.saturating_sub(past_diff.x as u32) as u32)) as usize * 4;
                    let src_end = src_row + w as usize * 4;
                    if src_end <= past_diff.pixels.len() {
                        clipped_pixels.extend_from_slice(&past_diff.pixels[src_row..src_end]);
                    }
                }
                restore_region(&mut pixmap, target_x, target_y, w, h, &clipped_pixels);
            }
            
            return Ok(Some(layer.id.clone()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn rehacer(state: State<'_, Arc<RwLock<AppState>>>) -> Result<Option<String>, String> {
    rehacer_core(state.inner())
}

pub fn rehacer_core(state: &Arc<RwLock<AppState>>) -> Result<Option<String>, String> {
    // Write: modifies history stacks and layer buffer
    let mut state_lock = state.write();
    let app_state = &mut *state_lock;
    let history = &mut app_state.history;
    let layers = &mut app_state.layers;

    if let Some(future_diff) = history.redo_stack.pop() {
        if let Some(layer) = layers.iter_mut().find(|l| l.id == future_diff.layer_id) {
            let mut pixmap = layer.buffer.write();
            
            if let Some(undo_diff) = capture_for_redo(&future_diff, layer.x, layer.y, &pixmap) {
                history.undo_stack.push(undo_diff);
            }
            
            let dx = (future_diff.layer_x_at_snapshot - layer.x) as i32;
            let dy = (future_diff.layer_y_at_snapshot - layer.y) as i32;
            
            let target_x = (future_diff.x as i32 + dx).max(0) as u32;
            let target_y = (future_diff.y as i32 + dy).max(0) as u32;
            
            let w = future_diff.width.min(pixmap.width().saturating_sub(target_x));
            let h = future_diff.height.min(pixmap.height().saturating_sub(target_y));
            
            if w > 0 && h > 0 {
                let mut clipped_pixels = Vec::with_capacity((w * h * 4) as usize);
                for dy in 0..h {
                    let src_row = (dy * future_diff.width + (target_x.saturating_sub(future_diff.x as u32) as u32)) as usize * 4;
                    let src_end = src_row + w as usize * 4;
                    if src_end <= future_diff.pixels.len() {
                        clipped_pixels.extend_from_slice(&future_diff.pixels[src_row..src_end]);
                    }
                }
                restore_region(&mut pixmap, target_x, target_y, w, h, &clipped_pixels);
            }
            
            return Ok(Some(layer.id.clone()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn obtener_capa_rgba(state: State<'_, Arc<RwLock<AppState>>>, id: String) -> Result<Vec<u8>, String> {
    obtener_capa_rgba_core(state.inner(), id)
}

pub fn obtener_capa_rgba_core(state: &Arc<RwLock<AppState>>, id: String) -> Result<Vec<u8>, String> {
    // Read-only: extracts layer pixel data
    let state_lock = state.read();
    if let Some(layer) = state_lock.layers.iter().find(|l| l.id == id) {
        let pixmap = layer.buffer.read();
        Ok(pixmap.data().to_vec()) 
    } else {
        Err("Capa no encontrada".to_string())
    }
}

#[tauri::command]
pub fn obtener_capa_png(state: State<'_, Arc<RwLock<AppState>>>, id: String) -> Result<Vec<u8>, String> {
    obtener_capa_png_core(state.inner(), id)
}

pub fn obtener_capa_png_core(state: &Arc<RwLock<AppState>>, id: String) -> Result<Vec<u8>, String> {
    // Read-only: encodes layer as PNG
    let state_lock = state.read();
    if let Some(layer) = state_lock.layers.iter().find(|l| l.id == id) {
        let pixmap = layer.buffer.read();
        pixmap.encode_png().map_err(|e| format!("Error PNG: {}", e))
    } else {
        Err("Capa no encontrada".to_string())
    }
}
