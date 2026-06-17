// src-tauri/src/commands/layers.rs
use crate::state::{AppState, HistoryOp, LayerSnapshot, NativeLayer};
use std::sync::Arc;
use parking_lot::RwLock;
use tiny_skia::Pixmap;

// honest-concurrency-tests (CONC-5): every `#[tauri::command]` delegates to a plain `*_core` sibling
// that takes `&Arc<RwLock<AppState>>`. Tests call the `_core` fns with a REAL Arc, so the unsound
// `mock_state` `std::mem::transmute(&T -> tauri::State)` helper is gone. The command wrappers carry
// only the IPC boundary; all logic lives in `_core`.

#[tauri::command]
pub fn anadir_capa(
    state: tauri::State<'_, Arc<RwLock<AppState>>>,
    id: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    anadir_capa_core(state.inner(), id, width, height)
}

pub fn anadir_capa_core(
    state: &Arc<RwLock<AppState>>,
    id: String,
    width: u32,
    height: u32,
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
    activar_capa_core(state.inner(), id)
}

pub fn activar_capa_core(state: &Arc<RwLock<AppState>>, id: String) -> Result<(), String> {
    let mut state_lock = state.write();
    state_lock.active_layer_id = id;
    Ok(())
}

#[tauri::command]
pub fn cambiar_opacidad_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String, opacity: f32) -> Result<(), String> {
    cambiar_opacidad_capa_core(state.inner(), id, opacity)
}

pub fn cambiar_opacidad_capa_core(state: &Arc<RwLock<AppState>>, id: String, opacity: f32) -> Result<(), String> {
    let mut state_lock = state.write();
    // Capture before-state for the inverse op, then mutate.
    let prev = state_lock.layers.iter().find(|l| l.id == id).map(|l| l.opacity);
    if let Some(from) = prev {
        if from != opacity {
            if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id) {
                layer.opacity = opacity;
            }
            state_lock.history.record(HistoryOp::OpacityChange { id, from, to: opacity });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn cambiar_visibilidad_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String, visible: bool) -> Result<(), String> {
    cambiar_visibilidad_capa_core(state.inner(), id, visible)
}

pub fn cambiar_visibilidad_capa_core(state: &Arc<RwLock<AppState>>, id: String, visible: bool) -> Result<(), String> {
    let mut state_lock = state.write();
    let prev = state_lock.layers.iter().find(|l| l.id == id).map(|l| l.visible);
    if let Some(from) = prev {
        if from != visible {
            if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id) {
                layer.visible = visible;
            }
            state_lock.history.record(HistoryOp::VisibilityChange { id, from, to: visible });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn eliminar_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String) -> Result<(), String> {
    eliminar_capa_core(state.inner(), id)
}

pub fn eliminar_capa_core(state: &Arc<RwLock<AppState>>, id: String) -> Result<(), String> {
    let mut state_lock = state.write();

    // Capture a full owned snapshot (cloned Pixmap + metadata + z-order index) BEFORE removing, so
    // the deletion can be undone by reinserting the layer exactly where it was.
    let index = match state_lock.layers.iter().position(|l| l.id == id) {
        Some(i) => i,
        None => return Ok(()),
    };
    let prev_active_id = state_lock.active_layer_id.clone();
    let snapshot = {
        let layer = &state_lock.layers[index];
        LayerSnapshot {
            id: layer.id.clone(),
            opacity: layer.opacity,
            visible: layer.visible,
            x: layer.x,
            y: layer.y,
            pixmap: layer.buffer.read().clone(),
        }
    };

    state_lock.layers.remove(index);
    if state_lock.active_layer_id == id {
        state_lock.active_layer_id = state_lock.layers.last().map(|l| l.id.clone()).unwrap_or_default();
    }

    // The layer is now removed, so the recorded op assumes `currently_removed: true` — applying it
    // (via deshacer) reinserts the layer.
    state_lock.history.record(HistoryOp::LayerDelete {
        index,
        prev_active_id,
        snapshot,
        currently_removed: true,
    });
    Ok(())
}

#[tauri::command]
pub fn reordenar_capas(state: tauri::State<'_, Arc<RwLock<AppState>>>, nuevos_ids: Vec<String>) -> Result<(), String> {
    reordenar_capas_core(state.inner(), nuevos_ids)
}

pub fn reordenar_capas_core(state: &Arc<RwLock<AppState>>, nuevos_ids: Vec<String>) -> Result<(), String> {
    let mut state_lock = state.write();
    // Capture the current z-order before sorting so the reorder can be inverted.
    let from_order: Vec<String> = state_lock.layers.iter().map(|l| l.id.clone()).collect();
    state_lock.layers.sort_by_key(|layer| {
        nuevos_ids.iter().position(|id| id == &layer.id).unwrap_or(usize::MAX)
    });
    let to_order: Vec<String> = state_lock.layers.iter().map(|l| l.id.clone()).collect();
    if from_order != to_order {
        state_lock.history.record(HistoryOp::LayerReorder { from_order, to_order });
    }
    Ok(())
}

#[tauri::command]
pub fn mover_capa(state: tauri::State<'_, Arc<RwLock<AppState>>>, id: String, x: f32, y: f32) -> Result<(), String> {
    mover_capa_core(state.inner(), id, x, y)
}

pub fn mover_capa_core(state: &Arc<RwLock<AppState>>, id: String, x: f32, y: f32) -> Result<(), String> {
    let mut state_lock = state.write();
    let prev = state_lock.layers.iter().find(|l| l.id == id).map(|l| (l.x, l.y));
    if let Some(from) = prev {
        if from != (x, y) {
            if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id) {
                layer.x = x;
                layer.y = y;
            }
            state_lock.history.record(HistoryOp::LayerMove { id, from, to: (x, y) });
        }
    }
    Ok(())
}
