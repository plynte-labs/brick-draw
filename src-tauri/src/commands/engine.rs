// src-tauri/src/commads/engine.rs
use crate::state::{AppState};
use std::sync::Arc;
use parking_lot::RwLock;
use tauri::{State, Window};

#[tauri::command]
pub fn componer_lienzo(_state: State<'_, Arc<RwLock<AppState>>>, _window: Window) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn reiniciar_motor(state: State<'_, Arc<RwLock<AppState>>>) -> Result<(), String> {
    let mut state_lock = state.write();
    
    state_lock.layers.clear();
    state_lock.active_layer_id = String::new();
    
    state_lock.history.undo_stack.clear();
    state_lock.history.redo_stack.clear();
    
    Ok(())
}