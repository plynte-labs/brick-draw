// src-tauri/src/commands/history.rs
use crate::state::{AppState, HistoryDiff, HistoryOp, NativeLayer};
use std::sync::Arc;
use parking_lot::RwLock;
use serde::Serialize;
use tauri::State;
use tiny_skia::Pixmap;
use ts_rs::TS;

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

/// Restores a `HistoryDiff` (pixel rect) into the matching layer's buffer, accounting for any
/// layer-offset drift between snapshot time and now (the original master dx/dy reconciliation).
fn restore_pixel_diff(layers: &mut [NativeLayer], diff: &HistoryDiff) {
    if let Some(layer) = layers.iter_mut().find(|l| l.id == diff.layer_id) {
        let mut pixmap = layer.buffer.write();
        let dx = (diff.layer_x_at_snapshot - layer.x) as i32;
        let dy = (diff.layer_y_at_snapshot - layer.y) as i32;

        let target_x = (diff.x as i32 + dx).max(0) as u32;
        let target_y = (diff.y as i32 + dy).max(0) as u32;

        let w = diff.width.min(pixmap.width().saturating_sub(target_x));
        let h = diff.height.min(pixmap.height().saturating_sub(target_y));

        if w > 0 && h > 0 {
            let mut clipped_pixels = Vec::with_capacity((w * h * 4) as usize);
            for dyy in 0..h {
                let src_row = (dyy * diff.width + target_x.saturating_sub(diff.x)) as usize * 4;
                let src_end = src_row + w as usize * 4;
                if src_end <= diff.pixels.len() {
                    clipped_pixels.extend_from_slice(&diff.pixels[src_row..src_end]);
                }
            }
            restore_region(&mut pixmap, target_x, target_y, w, h, &clipped_pixels);
        }
    }
}

/// Structured result returned to the frontend so it can re-sync whatever the op touched.
/// `kind` is a discriminant: the frontend `applyUndoResult` dispatches on it. The pixel path keeps
/// master's behaviour (re-pull the layer PNG); structural ops carry the metadata needed to patch
/// the Zustand store without an IPC round-trip.
#[derive(Serialize, TS, Clone, Debug)]
#[ts(export, export_to = "../../src/types/UndoResult.ts")]
pub struct UndoResult {
    /// One of: "pixel" | "move" | "opacity" | "visibility" | "delete" | "reorder" | "selection".
    pub kind: String,
    /// Affected layer id (empty for reorder/selection where it is not a single layer).
    pub layer_id: String,
    /// For "move": the resulting position. For "delete"-restore: the reinserted layer position.
    pub x: Option<f32>,
    pub y: Option<f32>,
    /// For "opacity".
    pub opacity: Option<f32>,
    /// For "visibility".
    pub visible: Option<bool>,
    /// For "delete": z-order index where the layer was (re)inserted.
    pub index: Option<u32>,
    /// For "delete": whether the layer now EXISTS (true = it was reinserted by undo; false = it was
    /// removed by redo). Lets the frontend add or drop the layer accordingly.
    pub layer_exists: Option<bool>,
    /// For "delete"-restore: layer width/height so the frontend can rebuild its OffscreenCanvas.
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// For "delete"-restore: the active layer id after restore.
    pub active_layer_id: Option<String>,
    /// For "reorder": the full id list in the new z-order.
    pub order: Option<Vec<String>>,
}

impl UndoResult {
    fn base(kind: &str) -> Self {
        UndoResult {
            kind: kind.to_string(),
            layer_id: String::new(),
            x: None,
            y: None,
            opacity: None,
            visible: None,
            index: None,
            layer_exists: None,
            width: None,
            height: None,
            active_layer_id: None,
            order: None,
        }
    }
}

/// Applies `op` to live state in the given `direction` and returns:
/// - `Ok((result, inverse_op))` — the op succeeded; `inverse_op` must be pushed onto the OPPOSITE
///   stack so the action can be replayed in the other direction.
/// - `Err(op)` — the op's target layer is gone (history would corrupt). The caller pushes the op
///   BACK onto the source stack and the command returns `Ok(None)`.
///
/// `direction == Forward` is the normal undo/redo apply; the returned inverse simply mirrors the
/// endpoints. Both `deshacer` and `rehacer` use the same routine — the only difference is which
/// stack feeds the op and which receives the inverse.
fn apply_op(
    op: HistoryOp,
    layers: &mut Vec<NativeLayer>,
    active_layer_id: &mut String,
    active_selection: &mut Option<Pixmap>,
) -> Result<(UndoResult, HistoryOp), HistoryOp> {
    match op {
        HistoryOp::PixelDiff(diff) => {
            // Capture the inverse (current pixels) BEFORE restoring, mirroring master's redo capture.
            let layer = match layers.iter_mut().find(|l| l.id == diff.layer_id) {
                Some(l) => l,
                None => return Err(HistoryOp::PixelDiff(diff)),
            };
            let inverse = {
                let pixmap = layer.buffer.read();
                capture_for_redo(&diff, layer.x, layer.y, &pixmap)
            };
            let inverse = match inverse {
                Some(d) => d,
                None => return Err(HistoryOp::PixelDiff(diff)),
            };
            restore_pixel_diff(layers, &diff);
            let mut res = UndoResult::base("pixel");
            res.layer_id = diff.layer_id.clone();
            Ok((res, HistoryOp::PixelDiff(inverse)))
        }

        HistoryOp::LayerMove { id, from, to } => {
            let layer = match layers.iter_mut().find(|l| l.id == id) {
                Some(l) => l,
                None => return Err(HistoryOp::LayerMove { id, from, to }),
            };
            // Applying this op moves the layer to `from`; the inverse moves it back to `to`.
            layer.x = from.0;
            layer.y = from.1;
            let mut res = UndoResult::base("move");
            res.layer_id = id.clone();
            res.x = Some(from.0);
            res.y = Some(from.1);
            Ok((res, HistoryOp::LayerMove { id, from: to, to: from }))
        }

        HistoryOp::OpacityChange { id, from, to } => {
            let layer = match layers.iter_mut().find(|l| l.id == id) {
                Some(l) => l,
                None => return Err(HistoryOp::OpacityChange { id, from, to }),
            };
            layer.opacity = from;
            let mut res = UndoResult::base("opacity");
            res.layer_id = id.clone();
            res.opacity = Some(from);
            Ok((res, HistoryOp::OpacityChange { id, from: to, to: from }))
        }

        HistoryOp::VisibilityChange { id, from, to } => {
            let layer = match layers.iter_mut().find(|l| l.id == id) {
                Some(l) => l,
                None => return Err(HistoryOp::VisibilityChange { id, from, to }),
            };
            layer.visible = from;
            let mut res = UndoResult::base("visibility");
            res.layer_id = id.clone();
            res.visible = Some(from);
            Ok((res, HistoryOp::VisibilityChange { id, from: to, to: from }))
        }

        HistoryOp::LayerDelete { index, prev_active_id, snapshot, currently_removed } => {
            if currently_removed {
                // Layer is ABSENT — applying REINSERTS it (undo of a deletion).
                if layers.iter().any(|l| l.id == snapshot.id) {
                    // Already present — corrupt history, push back.
                    return Err(HistoryOp::LayerDelete { index, prev_active_id, snapshot, currently_removed });
                }
                let rebuilt = NativeLayer {
                    id: snapshot.id.clone(),
                    opacity: snapshot.opacity,
                    visible: snapshot.visible,
                    x: snapshot.x,
                    y: snapshot.y,
                    buffer: Arc::new(RwLock::new(snapshot.pixmap.clone())),
                };
                let insert_at = index.min(layers.len());
                layers.insert(insert_at, rebuilt);
                let restored_active = if !prev_active_id.is_empty() && layers.iter().any(|l| l.id == prev_active_id) {
                    prev_active_id.clone()
                } else {
                    active_layer_id.clone()
                };
                *active_layer_id = restored_active.clone();

                let mut res = UndoResult::base("delete");
                res.layer_id = snapshot.id.clone();
                res.x = Some(snapshot.x);
                res.y = Some(snapshot.y);
                res.opacity = Some(snapshot.opacity);
                res.visible = Some(snapshot.visible);
                res.index = Some(insert_at as u32);
                res.layer_exists = Some(true);
                res.width = Some(snapshot.pixmap.width());
                res.height = Some(snapshot.pixmap.height());
                res.active_layer_id = Some(restored_active);

                // Inverse: re-delete (now the layer is present, so currently_removed: false).
                let inverse = HistoryOp::LayerDelete {
                    index: insert_at,
                    prev_active_id,
                    snapshot,
                    currently_removed: false,
                };
                Ok((res, inverse))
            } else {
                // Layer is PRESENT — applying REMOVES it (redo of a deletion).
                let pos = match layers.iter().position(|l| l.id == snapshot.id) {
                    Some(p) => p,
                    None => return Err(HistoryOp::LayerDelete { index, prev_active_id, snapshot, currently_removed }),
                };
                layers.remove(pos);
                if active_layer_id == &snapshot.id {
                    *active_layer_id = layers.last().map(|l| l.id.clone()).unwrap_or_default();
                }

                let mut res = UndoResult::base("delete");
                res.layer_id = snapshot.id.clone();
                res.layer_exists = Some(false);
                res.active_layer_id = Some(active_layer_id.clone());

                // Inverse: reinsert at the same slot (currently_removed: true again).
                let inverse = HistoryOp::LayerDelete {
                    index: pos,
                    prev_active_id,
                    snapshot,
                    currently_removed: true,
                };
                Ok((res, inverse))
            }
        }

        HistoryOp::LayerReorder { from_order, to_order } => {
            // Applying reorders layers into `from_order` (the pre-reorder state); inverse goes to `to_order`.
            layers.sort_by_key(|layer| {
                from_order.iter().position(|id| id == &layer.id).unwrap_or(usize::MAX)
            });
            let mut res = UndoResult::base("reorder");
            res.order = Some(from_order.clone());
            Ok((res, HistoryOp::LayerReorder { from_order: to_order, to_order: from_order }))
        }

        HistoryOp::Selection { prev_mask, next_mask } => {
            *active_selection = prev_mask.clone();
            let mut res = UndoResult::base("selection");
            res.layer_exists = Some(prev_mask.is_some());
            Ok((res, HistoryOp::Selection { prev_mask: next_mask, next_mask: prev_mask }))
        }
    }
}

#[tauri::command]
pub fn deshacer(state: State<'_, Arc<RwLock<AppState>>>) -> Result<Option<UndoResult>, String> {
    deshacer_core(state.inner())
}

// honest-concurrency-tests (CONC-5): plain core fns over `&Arc<RwLock<AppState>>` so tests drive
// them with a real Arc (no transmute). The `#[tauri::command]` wrappers are just the IPC boundary.
pub fn deshacer_core(state: &Arc<RwLock<AppState>>) -> Result<Option<UndoResult>, String> {
    let mut state_lock = state.write();
    let app_state = &mut *state_lock;

    let op = match app_state.history.undo_stack.pop() {
        Some(op) => op,
        None => return Ok(None),
    };

    match apply_op(
        op,
        &mut app_state.layers,
        &mut app_state.active_layer_id,
        &mut app_state.active_selection,
    ) {
        Ok((result, inverse)) => {
            app_state.history.redo_stack.push(inverse);
            Ok(Some(result))
        }
        Err(op) => {
            // Target gone — push back, do not corrupt the stack.
            app_state.history.undo_stack.push(op);
            Ok(None)
        }
    }
}

#[tauri::command]
pub fn rehacer(state: State<'_, Arc<RwLock<AppState>>>) -> Result<Option<UndoResult>, String> {
    rehacer_core(state.inner())
}

pub fn rehacer_core(state: &Arc<RwLock<AppState>>) -> Result<Option<UndoResult>, String> {
    let mut state_lock = state.write();
    let app_state = &mut *state_lock;

    let op = match app_state.history.redo_stack.pop() {
        Some(op) => op,
        None => return Ok(None),
    };

    match apply_op(
        op,
        &mut app_state.layers,
        &mut app_state.active_layer_id,
        &mut app_state.active_selection,
    ) {
        Ok((result, inverse)) => {
            app_state.history.undo_stack.push(inverse);
            Ok(Some(result))
        }
        Err(op) => {
            app_state.history.redo_stack.push(op);
            Ok(None)
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::layers::{
        anadir_capa_core, cambiar_opacidad_capa_core, cambiar_visibilidad_capa_core,
        eliminar_capa_core, mover_capa_core, reordenar_capas_core,
    };

    // honest-concurrency-tests (CONC-5): every test drives the `_core` fns with a REAL
    // `Arc<RwLock<AppState>>` — no `mem::transmute` mock. Each test asserts the full round trip:
    //   do op -> deshacer reverts -> rehacer reapplies.

    fn fresh() -> Arc<RwLock<AppState>> {
        Arc::new(RwLock::new(AppState::new()))
    }

    fn layer_xy(state: &Arc<RwLock<AppState>>, id: &str) -> (f32, f32) {
        let s = state.read();
        let l = s.layers.iter().find(|l| l.id == id).unwrap();
        (l.x, l.y)
    }

    #[test]
    fn move_roundtrip() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 32, 32).unwrap();
        // origin starts at (0,0)
        mover_capa_core(&state, "a".into(), 10.0, 20.0).unwrap();
        assert_eq!(layer_xy(&state, "a"), (10.0, 20.0));

        let r = deshacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "move");
        assert_eq!(layer_xy(&state, "a"), (0.0, 0.0), "undo reverts the move");

        let r = rehacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "move");
        assert_eq!(layer_xy(&state, "a"), (10.0, 20.0), "redo reapplies the move");
    }

    #[test]
    fn opacity_roundtrip() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 8, 8).unwrap();
        cambiar_opacidad_capa_core(&state, "a".into(), 0.4).unwrap();

        let opacity = |s: &Arc<RwLock<AppState>>| s.read().layers[0].opacity;
        assert_eq!(opacity(&state), 0.4);

        let r = deshacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "opacity");
        assert_eq!(opacity(&state), 1.0, "undo reverts opacity to 1.0");

        let r = rehacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "opacity");
        assert_eq!(opacity(&state), 0.4, "redo reapplies opacity");
    }

    #[test]
    fn visibility_roundtrip() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 8, 8).unwrap();
        cambiar_visibilidad_capa_core(&state, "a".into(), false).unwrap();

        let visible = |s: &Arc<RwLock<AppState>>| s.read().layers[0].visible;
        assert!(!visible(&state));

        deshacer_core(&state).unwrap().unwrap();
        assert!(visible(&state), "undo restores visibility");

        rehacer_core(&state).unwrap().unwrap();
        assert!(!visible(&state), "redo re-hides");
    }

    #[test]
    fn delete_roundtrip_preserves_zorder_and_pixels() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 8, 8).unwrap();
        anadir_capa_core(&state, "b".into(), 8, 8).unwrap();
        anadir_capa_core(&state, "c".into(), 8, 8).unwrap();

        // Mutate b's pixels so we can verify the snapshot round-trips the buffer.
        {
            let s = state.read();
            let layer_b = s.layers.iter().find(|l| l.id == "b").unwrap();
            let mut pm = layer_b.buffer.write();
            pm.data_mut()[0] = 123;
        }

        eliminar_capa_core(&state, "b".into()).unwrap();
        {
            let s = state.read();
            assert_eq!(s.layers.len(), 2);
            assert!(s.layers.iter().all(|l| l.id != "b"), "b removed");
        }

        let r = deshacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "delete");
        assert_eq!(r.layer_exists, Some(true));
        {
            let s = state.read();
            assert_eq!(s.layers.len(), 3);
            // Reinserted at original z-order slot (index 1, between a and c).
            assert_eq!(s.layers[1].id, "b", "b reinserted at original index");
            assert_eq!(s.layers[1].buffer.read().data()[0], 123, "pixels round-trip via snapshot");
        }

        let r = rehacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "delete");
        assert_eq!(r.layer_exists, Some(false));
        {
            let s = state.read();
            assert_eq!(s.layers.len(), 2);
            assert!(s.layers.iter().all(|l| l.id != "b"), "redo re-deletes b");
        }
    }

    #[test]
    fn reorder_roundtrip() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 8, 8).unwrap();
        anadir_capa_core(&state, "b".into(), 8, 8).unwrap();
        anadir_capa_core(&state, "c".into(), 8, 8).unwrap();

        let order = |s: &Arc<RwLock<AppState>>| -> Vec<String> {
            s.read().layers.iter().map(|l| l.id.clone()).collect()
        };
        assert_eq!(order(&state), vec!["a", "b", "c"]);

        reordenar_capas_core(&state, vec!["c".into(), "a".into(), "b".into()]).unwrap();
        assert_eq!(order(&state), vec!["c", "a", "b"]);

        let r = deshacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "reorder");
        assert_eq!(order(&state), vec!["a", "b", "c"], "undo restores original order");

        let r = rehacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "reorder");
        assert_eq!(order(&state), vec!["c", "a", "b"], "redo reapplies order");
    }

    #[test]
    fn selection_roundtrip() {
        let state = fresh();
        // Start with no selection; set one directly via the history op the selector would record.
        {
            let mut s = state.write();
            let mask = Pixmap::new(4, 4).unwrap();
            let prev = s.active_selection.clone();
            s.active_selection = Some(mask.clone());
            s.history.record(HistoryOp::Selection { prev_mask: prev, next_mask: Some(mask) });
        }
        assert!(state.read().active_selection.is_some());

        let r = deshacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "selection");
        assert!(state.read().active_selection.is_none(), "undo clears selection");

        let r = rehacer_core(&state).unwrap().unwrap();
        assert_eq!(r.kind, "selection");
        assert!(state.read().active_selection.is_some(), "redo restores selection");
    }

    #[test]
    fn missing_layer_pushes_op_back() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 8, 8).unwrap();
        mover_capa_core(&state, "a".into(), 5.0, 5.0).unwrap();
        // Drop the layer out from under the op (simulate a structurally inconsistent stack).
        state.write().layers.clear();

        let r = deshacer_core(&state).unwrap();
        assert!(r.is_none(), "undo of a vanished layer returns None");
        assert_eq!(state.read().history.undo_stack.len(), 1, "op is pushed back, not lost");
    }

    #[test]
    fn new_action_clears_redo_stack() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 8, 8).unwrap();
        mover_capa_core(&state, "a".into(), 3.0, 0.0).unwrap();
        deshacer_core(&state).unwrap().unwrap();
        assert_eq!(state.read().history.redo_stack.len(), 1);

        // A brand-new action must invalidate the redo branch.
        cambiar_opacidad_capa_core(&state, "a".into(), 0.5).unwrap();
        assert_eq!(state.read().history.redo_stack.len(), 0, "new action clears redo");
    }

    #[test]
    fn cap_drops_oldest() {
        let state = fresh();
        anadir_capa_core(&state, "a".into(), 8, 8).unwrap();
        // max_steps is 20; push 25 opacity changes.
        for i in 0..25u32 {
            let op = (i as f32 + 1.0) / 100.0;
            cambiar_opacidad_capa_core(&state, "a".into(), op).unwrap();
        }
        assert_eq!(state.read().history.undo_stack.len(), 20, "cap holds at max_steps");
    }
}
