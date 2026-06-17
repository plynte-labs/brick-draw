// src-tauri/src/commands/layers.rs
use crate::state::{AppState, NativeLayer};
use std::sync::Arc;
use parking_lot::RwLock;
use tiny_skia::Pixmap;

#[tauri::command]
pub fn anadir_capa(
    state: tauri::State<'_, Arc<RwLock<AppState>>>, 
    id: String,
    width: u32, 
    height: u32
) -> Result<(), String> {
    
    // 🚀 FIX: Validación estricta
    if width == 0 || height == 0 || width > 16384 || height > 16384 {
        return Err(format!("Dimensiones inválidas: {}x{}", width, height));
    }

    let mut state_lock = state.write();
    state_lock.canvas_width = width;
    state_lock.canvas_height = height;

    let pixmap = Pixmap::new(width, height).ok_or("Error al reservar RAM para capa")?;

    let nueva_capa = NativeLayer {
        id: id.clone(),
        opacity: 1.0,
        visible: true,
        x: 0.0,
        y: 0.0, 
        buffer: Arc::new(RwLock::new(pixmap)),
    };
    
    state_lock.layers.push(nueva_capa);
    state_lock.active_layer_id = id;
    Ok(())
}

#[tauri::command]
pub fn activar_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String) -> Result<(), String> {
    let mut state_lock = state.write();
    state_lock.active_layer_id = id;
    Ok(())
}

#[tauri::command]
pub fn cambiar_opacidad_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String, opacity: f32) -> Result<(), String> {
    let mut state_lock = state.write();
    if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id) {
        layer.opacity = opacity;
    }
    Ok(())
}

#[tauri::command]
pub fn cambiar_visibilidad_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String, visible: bool) -> Result<(), String> {
    let mut state_lock = state.write();
    if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id) {
        layer.visible = visible;
    }
    Ok(())
}

#[tauri::command]
pub fn eliminar_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String) -> Result<(), String> {
    let mut state_lock = state.write();
    state_lock.layers.retain(|layer| layer.id != id);
    if state_lock.active_layer_id == id {
        state_lock.active_layer_id = state_lock.layers.last().map(|l| l.id.clone()).unwrap_or_default();
    }
    Ok(())
}

#[tauri::command]
pub fn reordenar_capas(state: tauri::State<'_, Arc<RwLock<AppState>>>, nuevos_ids: Vec<String>) -> Result<(), String> {
    let mut state_lock = state.write();
    state_lock.layers.sort_by_key(|layer| {
        nuevos_ids.iter().position(|id| id == &layer.id).unwrap_or(usize::MAX)
    });
    Ok(())
}

#[tauri::command]
pub fn mover_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String, x: f32, y: f32) -> Result<(), String> {
    let mut state_lock = state.write();
    if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id) {
        layer.x = x;
        layer.y = y;
    }
    Ok(())
}