// src-tauri/src/commands/draw.rs
use crate::state::{AppState, HistoryDiff};
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::{State};
use tiny_skia::{BlendMode, Color, LineCap, LineJoin, Paint, PathBuilder, Pixmap, PixmapPaint, Stroke, Transform};
use ts_rs::TS;

#[derive(Deserialize, TS)]
#[ts(export, export_to = "../../src/types/PuntoTrazo.ts")]
pub struct PuntoTrazo {
    pub x: f32,
    pub y: f32,
    pub p: f32, 
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/types/LayerBounds.ts")]
pub struct LayerBounds {
    pub x: f32,
    pub y: f32,
}

fn hex_a_color(hex: &str, alpha: f32) -> Color {
    if hex.len() < 7 || !hex.starts_with('#') {
        return Color::BLACK;
    }
    let r = u8::from_str_radix(&hex[1..3], 16).unwrap_or(0) as f32 / 255.0;
    let g = u8::from_str_radix(&hex[3..5], 16).unwrap_or(0) as f32 / 255.0;
    let b = u8::from_str_radix(&hex[5..7], 16).unwrap_or(0) as f32 / 255.0;
    Color::from_rgba(r, g, b, alpha).unwrap_or(Color::BLACK)
}

#[tauri::command]
pub fn procesar_trazo(
    state: State<'_, Arc<RwLock<AppState>>>,
    id_capa: String, 
    puntos: Vec<PuntoTrazo>, 
    tool: String,
    color: String,
    size: f32,
    opacity: f32,
) -> Result<Option<LayerBounds>, String> {
    if puntos.len() < 2 { return Ok(None); }

    if !size.is_finite() || size <= 0.0 || size > 10000.0 {
        return Err("Tamaño de pincel inválido".to_string());
    }
    let opacity = opacity.clamp(0.0, 1.0);

    let mut diff_to_save: Option<HistoryDiff> = None;
    let bounds_update: Option<LayerBounds>;

    // ── CONC-1 (lockfree-io-snapshot): three-phase split so the OUTER write lock is NOT held across ──
    // the CPU-bound raster. Phase 1 (short outer write): clone active_selection, find the target layer,
    // perform the resize (which MUTATES layer.x/layer.y and replaces *pixmap — cheap: one alloc + one
    // draw_pixmap) WHILE STILL under the outer lock so the CONC-4 commit ordering
    // (*pixmap=new_pixmap; layer.x; layer.y) stays intact, capture the post-resize offsets + Arc-clone the
    // layer buffer. Phase 2 (NO outer lock, inner buf.write() only): dirty-region capture + raster against
    // the inner buffer alone — other layers' reads proceed concurrently. Phase 3 (short outer write): push
    // the HistoryDiff with the post-resize offsets captured in Phase 1.

    let presion_prom = puntos.last().map(|p| p.p).unwrap_or(0.5);
    let padding = size * presion_prom.max(0.5) * 2.0;

    let mut min_x = std::f32::INFINITY;
    let mut min_y = std::f32::INFINITY;
    let mut max_x = std::f32::NEG_INFINITY;
    let mut max_y = std::f32::NEG_INFINITY;
    for p in &puntos {
        if p.x < min_x { min_x = p.x; }
        if p.y < min_y { min_y = p.y; }
        if p.x > max_x { max_x = p.x; }
        if p.y > max_y { max_y = p.y; }
    }
    min_x -= padding;
    min_y -= padding;
    max_x += padding;
    max_y += padding;

    // ── PHASE 1: short outer write lock — clone selection + resize (CONC-4 ordering preserved) ──
    let buf: Arc<RwLock<Pixmap>>;
    let mask_opt;
    let offset_x: f32;
    let offset_y: f32;
    {
        let mut state_lock = state.write();
        mask_opt = state_lock.active_selection.clone();

        let layer = match state_lock.layers.iter_mut().find(|l| l.id == id_capa) {
            Some(l) => l,
            None => return Ok(None),
        };

        // RESIZE LOGIC FIRST (mutates layer.x/layer.y + *pixmap). Kept under the short outer lock so the
        // verified-sound CONC-4 commit ordering (*pixmap=new_pixmap; layer.x; layer.y) is NOT reordered.
        if tool != "eraser" {
            let mut pixmap = layer.buffer.write();
            let old_lx = layer.x;
            let old_ly = layer.y;
            let old_w = pixmap.width() as f32;
            let old_h = pixmap.height() as f32;

            let new_lx = old_lx.min(min_x).floor();
            let new_ly = old_ly.min(min_y).floor();
            let new_right = (old_lx + old_w).max(max_x).ceil();
            let new_bottom = (old_ly + old_h).max(max_y).ceil();

            let new_w = (new_right - new_lx) as u32;
            let new_h = (new_bottom - new_ly) as u32;

            if new_w > pixmap.width() || new_h > pixmap.height() {
                if let Some(mut new_pixmap) = Pixmap::new(new_w, new_h) {
                    let dx = (old_lx - new_lx) as i32;
                    let dy = (old_ly - new_ly) as i32;

                    new_pixmap.draw_pixmap(
                        dx, dy, pixmap.as_ref(), &PixmapPaint::default(), Transform::identity(), None
                    );

                    *pixmap = new_pixmap;
                    layer.x = new_lx;
                    layer.y = new_ly;
                }
            }
            // inner buffer write guard dropped at end of this block, before Phase 2 re-takes buf.write()
        }

        offset_x = layer.x;
        offset_y = layer.y;
        buf = Arc::clone(&layer.buffer);
        bounds_update = Some(LayerBounds { x: layer.x, y: layer.y });
        // bounds_update is unconditionally set on the layer-found path; the not-found path returns above.
    } // ── outer write guard dropped: raster below runs with NO outer lock held ──

    // ── PHASE 2: inner buffer lock only — dirty capture + raster (other layers unblocked) ──
    {
        let mut pixmap = buf.write();

        // CAPTURE DIRTY REGION AFTER RESIZE (coordinates are now stable).
        let dirty_min_x = (min_x - offset_x).max(0.0) as i32;
        let dirty_min_y = (min_y - offset_y).max(0.0) as i32;
        let dirty_max_x = (max_x - offset_x).min(pixmap.width() as f32).ceil() as i32;
        let dirty_max_y = (max_y - offset_y).min(pixmap.height() as f32).ceil() as i32;

        let dirty_w = (dirty_max_x - dirty_min_x).max(0) as u32;
        let dirty_h = (dirty_max_y - dirty_min_y).max(0) as u32;

        if dirty_w > 0 && dirty_h > 0 {
            let pixel_count = (dirty_w as u64 * dirty_h as u64 * 4) as usize;
            let mut pixels = Vec::with_capacity(pixel_count);
            for dy in 0..dirty_h {
                let row_start = ((dirty_min_y as u32 + dy) as usize * pixmap.width() as usize + dirty_min_x as usize) * 4;
                let row_end = row_start + dirty_w as usize * 4;
                pixels.extend_from_slice(&pixmap.data()[row_start..row_end]);
            }

            // layer_x/y_at_snapshot reflect the POST-resize offsets captured in Phase 1 (not a re-read).
            diff_to_save = Some(HistoryDiff {
                layer_id: id_capa.clone(),
                x: dirty_min_x as u32,
                y: dirty_min_y as u32,
                width: dirty_w,
                height: dirty_h,
                pixels,
                layer_x_at_snapshot: offset_x,
                layer_y_at_snapshot: offset_y,
            });
        }

        // ── DRAWING ──
        let mut paint = Paint::default();
        if tool == "eraser" {
            paint.blend_mode = BlendMode::DestinationOut;
            paint.set_color(Color::from_rgba(0.0, 0.0, 0.0, opacity).unwrap_or(Color::TRANSPARENT));
        } else {
            paint.blend_mode = BlendMode::SourceOver;
            paint.set_color(hex_a_color(&color, opacity));
        }

        let mut stroke = Stroke::default();
        stroke.line_cap = LineCap::Round;
        stroke.line_join = LineJoin::Round;
        stroke.width = size * presion_prom * 2.0;

        let mut pb = PathBuilder::new();
        pb.move_to(puntos[0].x - offset_x, puntos[0].y - offset_y);
        for i in 1..puntos.len() {
            pb.line_to(puntos[i].x - offset_x, puntos[i].y - offset_y);
        }

        if let Some(path) = pb.finish() {
            let needs_heavy_buffer = mask_opt.is_some() || (tool == "eraser" && puntos.len() > 5);

            if needs_heavy_buffer {
                if let Some(mut temp_pixmap) = Pixmap::new(pixmap.width(), pixmap.height()) {
                    let mut temp_paint = paint.clone();
                    temp_paint.blend_mode = BlendMode::SourceOver;
                    if tool == "eraser" {
                        temp_paint.set_color(Color::from_rgba(0.0, 0.0, 0.0, opacity).unwrap_or(Color::TRANSPARENT));
                    }
                    temp_pixmap.stroke_path(&path, &temp_paint, &stroke, Transform::identity(), None);

                    if let Some(mask) = mask_opt {
                        let mut mask_paint = PixmapPaint::default();
                        mask_paint.blend_mode = BlendMode::DestinationIn;
                        temp_pixmap.draw_pixmap(-offset_x as i32, -offset_y as i32, mask.as_ref(), &mask_paint, Transform::identity(), None);
                    }

                    let mut final_paint = PixmapPaint::default();
                    final_paint.blend_mode = if tool == "eraser" { BlendMode::DestinationOut } else { BlendMode::SourceOver };
                    pixmap.draw_pixmap(0, 0, temp_pixmap.as_ref(), &final_paint, Transform::identity(), None);
                }
            } else {
                pixmap.stroke_path(&path, &paint, &stroke, Transform::identity(), None);
            }
        }
    } // ── inner buffer guard dropped ──

    // ── PHASE 3: short outer write lock — push the HistoryDiff (ordering: AFTER the raster) ──
    if let Some(diff) = diff_to_save {
        let mut state_lock = state.write();
        let history = &mut state_lock.history;
        if history.undo_stack.len() >= history.max_steps {
            history.undo_stack.remove(0);
        }
        history.undo_stack.push(diff);
        history.redo_stack.clear();
    }

    Ok(bounds_update)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::history::deshacer;
    use crate::commands::layers::anadir_capa;

    fn mock_state<'a, T: Send + Sync + 'static>(val: &'a T) -> State<'a, T> {
        unsafe { std::mem::transmute(val) }
    }

    /// CONC-1 three-phase correctness: a stroke whose points fall OUTSIDE the current layer bounds
    /// triggers a resize. The split (Phase 1 short outer write for resize + Arc-clone; Phase 2 inner
    /// buffer.write for raster; Phase 3 short outer write for history) must still:
    ///   - update layer.x/layer.y and enlarge the buffer (resize ordering / CONC-4 preserved),
    ///   - push exactly one HistoryDiff carrying the POST-resize layer_x/y_at_snapshot,
    ///   - leave the stroke restorable via deshacer.
    #[test]
    fn procesar_trazo_three_phase_resize_history_and_undo() {
        let state = Arc::new(RwLock::new(AppState::new()));
        anadir_capa(mock_state(&state), "capa".to_string(), 32, 32).unwrap();

        // Points to the LEFT/ABOVE the origin (negative coords) force a resize that moves layer.x/y.
        let puntos = vec![
            PuntoTrazo { x: -40.0, y: -30.0, p: 1.0 },
            PuntoTrazo { x: 10.0, y: 10.0, p: 1.0 },
        ];
        let res = procesar_trazo(
            mock_state(&state),
            "capa".to_string(),
            puntos,
            "brush".to_string(),
            "#ff0000".to_string(),
            6.0,
            1.0,
        ).unwrap();
        assert!(res.is_some(), "a resizing stroke returns updated bounds");

        {
            let s = state.read();
            let layer = s.layers.iter().find(|l| l.id == "capa").unwrap();
            // Resize moved the layer origin to negative (offset) space.
            assert!(layer.x < 0.0, "layer.x must move negative after a leftward resize, got {}", layer.x);
            assert!(layer.y < 0.0, "layer.y must move negative after an upward resize, got {}", layer.y);
            // Buffer grew beyond the original 32x32.
            assert!(layer.buffer.read().width() > 32, "buffer must enlarge horizontally");
            assert!(layer.buffer.read().height() > 32, "buffer must enlarge vertically");

            // Exactly one HistoryDiff, with the POST-resize offsets captured in Phase 1.
            assert_eq!(s.history.undo_stack.len(), 1, "exactly one history entry pushed");
            let diff = &s.history.undo_stack[0];
            assert_eq!(diff.layer_x_at_snapshot, layer.x, "history snapshot offset must be post-resize x");
            assert_eq!(diff.layer_y_at_snapshot, layer.y, "history snapshot offset must be post-resize y");
        }

        // The stroke must actually mark pixels, and deshacer must restore them.
        let painted_before_undo = {
            let s = state.read();
            let buf = s.layers[0].buffer.read();
            buf.data().iter().skip(3).step_by(4).filter(|&&a| a > 0).count()
        };
        assert!(painted_before_undo > 0, "stroke must paint at least one opaque pixel");

        let undone = deshacer(mock_state(&state)).unwrap();
        assert_eq!(undone.as_deref(), Some("capa"), "undo targets the painted layer");

        let painted_after_undo = {
            let s = state.read();
            let buf = s.layers[0].buffer.read();
            buf.data().iter().skip(3).step_by(4).filter(|&&a| a > 0).count()
        };
        assert!(
            painted_after_undo < painted_before_undo,
            "deshacer must restore the dirty region (fewer opaque pixels after undo): {} -> {}",
            painted_before_undo, painted_after_undo
        );
    }
}
