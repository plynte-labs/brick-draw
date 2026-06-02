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

    let mut state_lock = state.write();
    let mut diff_to_save: Option<HistoryDiff> = None;
    let mut bounds_update: Option<LayerBounds> = None;

    let mask_opt = state_lock.active_selection.clone();

    if let Some(layer) = state_lock.layers.iter_mut().find(|l| l.id == id_capa) {
        let mut pixmap = layer.buffer.write();

        let mut min_x = std::f32::INFINITY;
        let mut min_y = std::f32::INFINITY;
        let mut max_x = std::f32::NEG_INFINITY;
        let mut max_y = std::f32::NEG_INFINITY;
        
        let presion_prom = puntos.last().map(|p| p.p).unwrap_or(0.5);
        let padding = size * presion_prom.max(0.5) * 2.0;

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

        // ── RESIZE LOGIC FIRST (before dirty capture) ──
        if tool != "eraser" {
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
        }

        // ── CAPTURE DIRTY REGION AFTER RESIZE (coordinates are now stable) ──
        let offset_x = layer.x;
        let offset_y = layer.y;
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
            
            diff_to_save = Some(HistoryDiff {
                layer_id: id_capa.clone(),
                x: dirty_min_x as u32,
                y: dirty_min_y as u32,
                width: dirty_w,
                height: dirty_h,
                pixels,
                layer_x_at_snapshot: layer.x,
                layer_y_at_snapshot: layer.y,
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

        bounds_update = Some(LayerBounds {
            x: layer.x,
            y: layer.y,
        });

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
        
    }

    if let Some(diff) = diff_to_save {
        let history = &mut state_lock.history;
        if history.undo_stack.len() >= history.max_steps {
            history.undo_stack.remove(0);
        }
        history.undo_stack.push(diff);
        history.redo_stack.clear();
    }
    
    Ok(bounds_update)
}
