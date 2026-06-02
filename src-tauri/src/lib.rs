// src-tauri/src/lib.rs
pub mod commands;
pub mod state;

use state::AppState;
use std::sync::Arc;
use parking_lot::RwLock;

// #[derive(Deserialize, Debug)]
// struct PuntoTrazo{
//     x: f32,
//     y: f32,
//     p:f32,
// }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // RwLock allows concurrent read access while exclusive access for writes
    let app_state = Arc::new(RwLock::new(AppState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state) // Inyectamos el estado a Tauri
        .invoke_handler(tauri::generate_handler![
            commands::draw::procesar_trazo,

            commands::io::guardar_dibujo,
            commands::io::obtener_lienzo_png,
            commands::io::obtener_mascara_png,
            commands::io::cargar_png_en_capa,
            commands::io::guardar_proyecto_brick,
            commands::io::cargar_proyecto_brick,

            commands::engine::componer_lienzo,
            commands::engine::reiniciar_motor,

            commands::layers::anadir_capa,
            commands::layers::activar_capa,
            commands::layers::cambiar_opacidad_capa,
            commands::layers::cambiar_visibilidad_capa,
            commands::layers::eliminar_capa,
            commands::layers::reordenar_capas,
            commands::layers::mover_capa,

            commands::selector::calcular_seleccion_varita,

            commands::history::deshacer,
            commands::history::rehacer,
            commands::history::obtener_capa_rgba,
            commands::history::obtener_capa_png,
            
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}