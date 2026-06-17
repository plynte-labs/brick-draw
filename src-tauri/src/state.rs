// src-tauri/src/state.rs
use std::sync::Arc;
use parking_lot::RwLock;
use tiny_skia::Pixmap;

pub struct NativeLayer {
    pub id: String,
    pub opacity: f32,
    pub visible: bool,
    pub x: f32,
    pub y: f32,
    pub buffer: Arc<RwLock<Pixmap>>,
}

/// Diff-based history entry — stores only the changed region instead of full Pixmap clone.
/// Memory savings: for a 4K canvas (30MB full clone), a typical stroke dirty region
/// is ~200x200px = ~160KB, a 187x reduction per history step.
#[derive(Clone)]
pub struct HistoryDiff {
    pub layer_id: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
    pub layer_x_at_snapshot: f32,
    pub layer_y_at_snapshot: f32,
}

/// History state using diff-based storage (memory efficient).
pub struct HistoryState {
    pub undo_stack: Vec<HistoryDiff>,
    pub redo_stack: Vec<HistoryDiff>,
    pub max_steps: usize,
}

impl Default for HistoryState {
    fn default() -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_steps: 20,
        }
    }
}

pub struct AppState {
    pub layers: Vec<NativeLayer>,
    pub active_layer_id: String,
    pub history: HistoryState,
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub active_selection: Option<Pixmap>,
    /// Timestamp of last save operation (ms since epoch) — used for rate limiting
    pub last_save_timestamp_ms: u128,
    /// Path of last saved file — used for duplicate write detection
    pub last_save_path: Option<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            layers: Vec::new(),
            active_layer_id: String::new(),
            history: HistoryState::default(),
            canvas_width: 0,
            canvas_height: 0,
            active_selection: None,
            last_save_timestamp_ms: 0,
            last_save_path: None,
        }
    }
}
