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

/// Owned snapshot of a layer for delete-undo. `NativeLayer` is NOT `Clone` (its `buffer` is an
/// `Arc<RwLock<Pixmap>>` shared handle), so a delete op stores a freshly CLONED `Pixmap` plus the
/// layer metadata. On undo we rebuild a `NativeLayer` with a brand-new `Arc<RwLock<Pixmap>>` and
/// reinsert it at its original z-order index.
pub struct LayerSnapshot {
    pub id: String,
    pub opacity: f32,
    pub visible: bool,
    pub x: f32,
    pub y: f32,
    pub pixmap: Pixmap,
}

/// Inverse-capable command-log entry. `Ctrl+Z` reverses the last action whatever it was — not just
/// pixels. Each variant stores BOTH endpoints (`from`/`to`) so a single op applies in either
/// direction without re-deriving from live state.
pub enum HistoryOp {
    /// Brush/eraser dirty-region diff (the original master history payload, now one variant).
    PixelDiff(HistoryDiff),
    /// Layer translate. Offsets are f32 in this codebase.
    LayerMove { id: String, from: (f32, f32), to: (f32, f32) },
    OpacityChange { id: String, from: f32, to: f32 },
    VisibilityChange { id: String, from: bool, to: bool },
    /// Layer deletion, encoded directionally. `index` is the z-order slot it occupied; `snapshot`
    /// owns a cloned Pixmap so the layer can be reinserted exactly; `prev_active_id` restores the
    /// prior active layer. `currently_removed` is the live state this op assumes: when `true` the
    /// layer is ABSENT and applying the op REINSERTS it (the undo of a deletion); when `false` the
    /// layer is PRESENT and applying REMOVES it (the redo of a deletion). The inverse flips the flag.
    LayerDelete {
        index: usize,
        prev_active_id: String,
        snapshot: LayerSnapshot,
        currently_removed: bool,
    },
    /// Z-order reorder. Both orders are the full id list before/after.
    LayerReorder { from_order: Vec<String>, to_order: Vec<String> },
    /// Magic-wand selection change. Stores the previous mask (None = no selection).
    Selection { prev_mask: Option<Pixmap>, next_mask: Option<Pixmap> },
}

/// History state using an inverse-capable command log (memory efficient for pixel ops).
pub struct HistoryState {
    pub undo_stack: Vec<HistoryOp>,
    pub redo_stack: Vec<HistoryOp>,
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

impl HistoryState {
    /// Records a brand-new user action: enforces the cap (oldest dropped), then clears the redo
    /// stack (a new action invalidates the redo branch). Used by every mutating command.
    pub fn record(&mut self, op: HistoryOp) {
        if self.undo_stack.len() >= self.max_steps {
            self.undo_stack.remove(0);
        }
        self.undo_stack.push(op);
        self.redo_stack.clear();
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
