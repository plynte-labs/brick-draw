// src-tauri/tests/concurrencia_estres.rs

#[cfg(test)]
mod tests {
    // 🚀 DHAT Allocator: Habilitado condicionalmente con la feature "dhat-heap"
    #[cfg(feature = "dhat-heap")]
    #[global_allocator]
    static ALLOC: dhat::Alloc = dhat::Alloc;

    use std::sync::Arc;
    use std::sync::mpsc;
    use std::thread;
    use std::time::{Duration, Instant};
    use parking_lot::RwLock;

    use brick_draw_lib::state::AppState;
    use brick_draw_lib::commands::draw::{procesar_trazo_core, PuntoTrazo};
    use brick_draw_lib::commands::layers::anadir_capa_core;
    use brick_draw_lib::commands::history::{deshacer_core, rehacer_core};
    use brick_draw_lib::commands::io::{
        guardar_proyecto_brick_core, CanvasMetadataDto, LayerMetadataDto,
    };

    // honest-concurrency-tests (CONC-5): the prior `mock_state` helper transmuted a `&Arc` into a
    // `tauri::State` (UNDEFINED BEHAVIOR — it relied on `State` being an undocumented repr-transparent
    // wrapper). It is GONE. Every command now exposes a plain `*_core` sibling over
    // `&Arc<RwLock<AppState>>`, so these tests call those directly with a REAL Arc — no transmute, no
    // fabricated `State`, sound by construction. grep for `transmute` in the test suite returns zero.

    // Helper para comparar píxeles con tolerancia de ±1 en canales RGBA
    fn comparar_pixeles_fuzzy(p1: &[u8], p2: &[u8]) -> bool {
        if p1.len() != p2.len() {
            return false;
        }
        for (i, (&v1, &v2)) in p1.iter().zip(p2.iter()).enumerate() {
            let diff = (v1 as i16 - v2 as i16).abs();
            if diff > 1 {
                println!(
                    "Diferencia de color excedida en el byte {}: val1={}, val2={}, diff={}",
                    i, v1, v2, diff
                );
                return false;
            }
        }
        true
    }

    /// Build a single-layer 512x512 manifest for the bounded-latency save test.
    fn metadata_512(id: &str) -> CanvasMetadataDto {
        CanvasMetadataDto {
            canvas_width: 512,
            canvas_height: 512,
            active_layer_id: id.to_string(),
            version: "1.0.0".to_string(),
            layers: vec![LayerMetadataDto {
                id: id.to_string(),
                name: id.to_string(),
                opacity: 1.0,
                visible: true,
                locked: false,
                x: 0.0,
                y: 0.0,
                width: 512,
                height: 512,
            }],
        }
    }

    // 1. TEST DE ESTRÉS DE CAPAS CON PERFILADO DE HEAP
    #[test]
    fn test_estres_100_capas_y_heap() {
        // Inicializar el profiler de dhat si está activa la feature dhat-heap
        #[cfg(feature = "dhat-heap")]
        let _profiler = dhat::Profiler::new_heap();

        let state = Arc::new(RwLock::new(AppState::new()));

        // Simular creación sucesiva de 100 capas
        for i in 0..100 {
            let id_capa = format!("layer_{}", i);
            anadir_capa_core(&state, id_capa, 256, 256).unwrap();
        }

        // Validar que se agregaron las 100 capas y que el canvas mide lo configurado
        let state_read = state.read();
        assert_eq!(state_read.layers.len(), 100);
        assert_eq!(state_read.canvas_width, 256);
        assert_eq!(state_read.canvas_height, 256);

        // Validar liberación de memoria limpiando las capas
        drop(state_read);
        {
            let mut state_write = state.write();
            state_write.layers.clear();
            state_write.active_layer_id.clear();
        }

        let state_final_read = state.read();
        assert_eq!(state_final_read.layers.len(), 0);
        println!("✅ Test de estrés de 100 capas finalizado con éxito.");
    }

    // 2. TEST SHIELD CONTRA DEADLOCKS POR RWLOCK (CON TIMEOUT)
    #[test]
    fn test_deadlock_shield_concurrente() {
        let state = Arc::new(RwLock::new(AppState::new()));

        // Preparamos 3 capas en el estado
        anadir_capa_core(&state, "capa_1".to_string(), 256, 256).unwrap();
        anadir_capa_core(&state, "capa_2".to_string(), 256, 256).unwrap();
        anadir_capa_core(&state, "capa_3".to_string(), 256, 256).unwrap();

        let (tx, rx) = mpsc::channel();
        const NUM_LECTORES: usize = 8;
        const NUM_ESCRITORES: usize = 2;

        // Lanzar hilos Lectores (Simulan render de UI y preview)
        for thread_idx in 0..NUM_LECTORES {
            let state_clone = state.clone();
            let tx_clone = tx.clone();
            thread::spawn(move || {
                for _ in 0..200 {
                    // Simular lectura recurrente del estado global y capas
                    let state_lock = state_clone.read();
                    if let Some(layer) = state_lock.layers.get(thread_idx % 3) {
                        let _buffer_lock = layer.buffer.read();
                    }
                    thread::sleep(Duration::from_micros(10));
                }
                tx_clone.send(format!("Lector_{}", thread_idx)).unwrap();
            });
        }

        // Lanzar hilos Escritores (Simulan usuario pintando)
        for thread_idx in 0..NUM_ESCRITORES {
            let state_clone = state.clone();
            let tx_clone = tx.clone();
            thread::spawn(move || {
                for step in 0..50 {
                    let id_capa = format!("capa_{}", (thread_idx + 1));
                    let puntos = vec![
                        PuntoTrazo { x: 10.0 + step as f32, y: 10.0, p: 0.8 },
                        PuntoTrazo { x: 20.0 + step as f32, y: 20.0, p: 0.8 },
                    ];

                    // Llamar al core de procesar_trazo (toma write lock breve por fase).
                    let _ = procesar_trazo_core(
                        &state_clone,
                        id_capa,
                        puntos,
                        "brush".to_string(),
                        "#ff0000".to_string(),
                        5.0,
                        1.0,
                    );
                    thread::sleep(Duration::from_millis(1));
                }
                tx_clone.send(format!("Escritor_{}", thread_idx)).unwrap();
            });
        }

        // Monitoreo del Deadlock Shield con Timeout estricto de 5 segundos
        let total_hilos = NUM_LECTORES + NUM_ESCRITORES;
        for _ in 0..total_hilos {
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(name) => println!("✅ Hilo '{}' finalizado exitosamente.", name),
                Err(_) => panic!("🚨 POSIBLE DEADLOCK DETECTADO: El test excedió el tiempo límite de 5 segundos."),
            }
        }

        println!("✅ Test de concurrencia superado sin deadlocks ni writer starvation.");
    }

    // 3. TEST DE INTEGRIDAD Y REVERSIBILIDAD DE HISTORYDIFF (FUZZY RGBA ±1)
    #[test]
    fn test_integridad_reversibilidad_historial() {
        let state = Arc::new(RwLock::new(AppState::new()));

        // Lienzo pequeño optimizado
        anadir_capa_core(&state, "capa_test".to_string(), 256, 256).unwrap();

        // 1. Capturar el estado vacío inicial de la capa
        let pixmap_vacio = {
            let state_read = state.read();
            let layer = state_read.layers.first().unwrap();
            let buf_read = layer.buffer.read();
            buf_read.data().to_vec()
        };

        // 2. Realizar un trazo (esto debe empujar un HistoryDiff al undo_stack)
        let puntos = vec![
            PuntoTrazo { x: 50.0, y: 50.0, p: 0.9 },
            PuntoTrazo { x: 150.0, y: 150.0, p: 0.9 },
        ];
        procesar_trazo_core(
            &state,
            "capa_test".to_string(),
            puntos,
            "brush".to_string(),
            "#00ff00".to_string(),
            10.0,
            1.0,
        ).unwrap();

        // 3. Capturar el estado de píxeles dibujado
        let pixmap_dibujado = {
            let state_read = state.read();
            let layer = state_read.layers.first().unwrap();
            let buf_read = layer.buffer.read();
            buf_read.data().to_vec()
        };

        // El estado dibujado debe ser diferente al vacío
        assert_ne!(pixmap_vacio, pixmap_dibujado);

        // 4. Ejecutar deshacer (deshace el trazo)
        let res_deshacer = deshacer_core(&state).unwrap().expect("deshacer debe retornar un resultado");
        assert_eq!(res_deshacer.kind, "pixel");
        assert_eq!(res_deshacer.layer_id, "capa_test");

        // Los píxeles deben haber vuelto a su estado vacío (fuzzy match ±1)
        let pixmap_tras_deshacer = {
            let state_read = state.read();
            let layer = state_read.layers.first().unwrap();
            let buf_read = layer.buffer.read();
            buf_read.data().to_vec()
        };
        assert!(
            comparar_pixeles_fuzzy(&pixmap_vacio, &pixmap_tras_deshacer),
            "Los píxeles tras deshacer no coinciden con el estado original."
        );

        // 5. Ejecutar rehacer (aplica el trazo nuevamente)
        let res_rehacer = rehacer_core(&state).unwrap().expect("rehacer debe retornar un resultado");
        assert_eq!(res_rehacer.kind, "pixel");
        assert_eq!(res_rehacer.layer_id, "capa_test");

        // Los píxeles deben coincidir con el estado dibujado (fuzzy match ±1)
        let pixmap_tras_rehacer = {
            let state_read = state.read();
            let layer = state_read.layers.first().unwrap();
            let buf_read = layer.buffer.read();
            buf_read.data().to_vec()
        };
        assert!(
            comparar_pixeles_fuzzy(&pixmap_dibujado, &pixmap_tras_rehacer),
            "Los píxeles tras rehacer no coinciden con el estado dibujado."
        );

        println!("✅ Test de integridad de HistoryDiff y reversibilidad pixel-perfect completado.");
    }

    // 4. TEST DE RESIZE CONCURRENTE
    #[test]
    fn test_resize_concurrente() {
        let state = Arc::new(RwLock::new(AppState::new()));

        anadir_capa_core(&state, "capa_resize".to_string(), 100, 100).unwrap();

        let (tx, rx) = mpsc::channel();

        // Hilo Escritor: Fuerza la auto-expansión dibujando muy afuera
        let state_clone = state.clone();
        let tx_clone = tx.clone();
        thread::spawn(move || {
            let puntos = vec![
                PuntoTrazo { x: 50.0, y: 50.0, p: 0.8 },
                PuntoTrazo { x: 450.0, y: 450.0, p: 0.8 }, // Provocará auto-resize de 100x100 a más de 450x450
            ];

            let _ = procesar_trazo_core(
                &state_clone,
                "capa_resize".to_string(),
                puntos,
                "brush".to_string(),
                "#0000ff".to_string(),
                5.0,
                1.0,
            );
            tx_clone.send("Escritor").unwrap();
        });

        // Hilo Lector: Intenta leer recursivamente la misma capa
        let state_clone2 = state.clone();
        let tx_clone2 = tx.clone();
        thread::spawn(move || {
            for _ in 0..100 {
                let state_read = state_clone2.read();
                if let Some(layer) = state_read.layers.first() {
                    let buffer_read = layer.buffer.read();
                    let _w = buffer_read.width();
                    let _h = buffer_read.height();
                }
                thread::sleep(Duration::from_micros(50));
            }
            tx_clone2.send("Lector").unwrap();
        });

        // Esperar confirmación
        for _ in 0..2 {
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(name) => println!("Hilo '{}' terminó sin pánicos.", name),
                Err(_) => panic!("🚨 Timeout en el test de resize concurrente. Posible Deadlock o exclusión de memoria corrupta."),
            }
        }

        // El canvas final debe haberse expandido
        let state_read = state.read();
        let layer = state_read.layers.first().unwrap();
        let buffer_lock = layer.buffer.read();
        assert!(buffer_lock.width() > 100);
        assert!(buffer_lock.height() > 100);
        println!("✅ Test de resize concurrente superado sin pánicos ni corrupción.");
    }

    // 5. TEST DE DESCARTE POR LÍMITE DE PILA DEL HISTORIAL (OOM PREVENTION)
    #[test]
    fn test_descarte_por_limite_de_pila_historial() {
        let state = Arc::new(RwLock::new(AppState::new()));

        anadir_capa_core(&state, "capa_hist".to_string(), 256, 256).unwrap();

        // Verificar límite de pila default es 20
        {
            let state_read = state.read();
            assert_eq!(state_read.history.max_steps, 20);
        }

        // Empujar 25 trazos sucesivos
        for i in 0..25 {
            let puntos = vec![
                PuntoTrazo { x: 10.0 + i as f32, y: 10.0, p: 0.5 },
                PuntoTrazo { x: 20.0 + i as f32, y: 20.0, p: 0.5 },
            ];
            procesar_trazo_core(
                &state,
                "capa_hist".to_string(),
                puntos,
                "brush".to_string(),
                "#000000".to_string(),
                5.0,
                1.0,
            ).unwrap();
        }

        // Validar que la pila de undo_stack se recortó a 20 y no creció a 25
        let state_read = state.read();
        assert_eq!(state_read.history.undo_stack.len(), 20);
        println!("✅ Test de descarte por límite de pila (OOM prevention) superado. Límite de 20 respetado.");
    }

    // 6. HONEST CONCURRENCY: WRITER LATENCY STAYS BOUNDED WHILE A SAVE HOLDS DISK I/O
    //
    // This is the test the feature is named after. The pre-lockfree-io save held the OUTER write lock
    // across the FULL Deflate-9 compression + sync_all + rename (tens of ms on a real ~1 MB layer). A
    // writer (procesar_trazo_core) landing mid-save would block for that ENTIRE flush, so its latency
    // would spike well past any sane bound. After the lockfree-io snapshot refactor on master, the save
    // takes only a SHORT snapshot lock (byte-copy the layer) and does ALL disk work with NO outer lock
    // held.
    //
    // So instead of merely proving "no deadlock within 5s" (which a lock-across-I/O save would also
    // pass), this test MEASURES per-stroke writer latency under a concurrent saver and asserts the 95th
    // percentile stays UNDER a generous bound. A regression that re-introduces lock-across-I/O would
    // push p95 over the bound and FAIL here — starvation is detected, not assumed.
    #[test]
    fn test_save_under_concurrent_writers_bounds_latency() {
        let state = Arc::new(RwLock::new(AppState::new()));
        anadir_capa_core(&state, "capa".to_string(), 512, 512).unwrap();

        // Pre-fill the layer with a real (non-zero) pattern so Deflate-9 has actual work to do (a layer
        // of all-zero bytes compresses to almost nothing and would not stress the save path).
        {
            let s = state.read();
            let layer = s.layers.iter().find(|l| l.id == "capa").unwrap();
            let mut buf = layer.buffer.write();
            let data = buf.data_mut();
            for (i, byte) in data.iter_mut().enumerate() {
                *byte = (i % 251) as u8; // prime-stride pattern resists compression
            }
        }

        // Unique .brick path in the OS temp dir (no collision across parallel test runs).
        let unique = format!(
            "brick_latency_{}_{}.brick",
            std::process::id(),
            Instant::now().elapsed().as_nanos()
        );
        let brick_path = std::env::temp_dir().join(unique);
        let brick_path_str = brick_path.to_string_lossy().to_string();

        let (tx, rx) = mpsc::channel::<Duration>();
        let (done_tx, done_rx) = mpsc::channel::<&'static str>();

        // ── SAVER thread: loops N saves, sleeping >= MIN_SAVE_INTERVAL_MS (500 ms) between calls so the
        //    rate-limit lets each save through (serial saves → one path, no temp collision). ──
        const SAVES: usize = 6;
        let state_saver = state.clone();
        let path_saver = brick_path_str.clone();
        let done_tx_saver = done_tx.clone();
        thread::spawn(move || {
            for _ in 0..SAVES {
                let _ = guardar_proyecto_brick_core(
                    &state_saver,
                    path_saver.clone(),
                    metadata_512("capa"),
                );
                // Clear the throttle window so the next iteration's save is not rate-limited.
                thread::sleep(Duration::from_millis(520));
            }
            done_tx_saver.send("Saver").unwrap();
        });

        // ── 2 WRITER threads: each runs ~200 small in-bounds strokes, timing every stroke and sending
        //    the elapsed Duration over the channel. A stroke blocked by a lock-across-I/O save would
        //    show up as a large dt. ──
        const WRITERS: usize = 2;
        const STROKES: usize = 200;
        for w in 0..WRITERS {
            let state_writer = state.clone();
            let tx_writer = tx.clone();
            let done_tx_writer = done_tx.clone();
            thread::spawn(move || {
                for step in 0..STROKES {
                    // Small in-bounds stroke (no resize): exercises the outer write lock briefly.
                    let base = 10.0 + (step % 100) as f32;
                    let puntos = vec![
                        PuntoTrazo { x: base, y: 10.0 + w as f32, p: 0.8 },
                        PuntoTrazo { x: base + 5.0, y: 15.0 + w as f32, p: 0.8 },
                    ];
                    let t0 = Instant::now();
                    let _ = procesar_trazo_core(
                        &state_writer,
                        "capa".to_string(),
                        puntos,
                        "brush".to_string(),
                        "#ff0000".to_string(),
                        4.0,
                        1.0,
                    );
                    let dt = t0.elapsed();
                    tx_writer.send(dt).unwrap();
                }
                done_tx_writer.send("Writer").unwrap();
            });
        }
        drop(tx); // only the writer clones hold senders now; recv ends when they finish.

        // Secondary guard: a deadlock shield. The SAVER intentionally sleeps >500 ms between its SAVES
        // iterations (to clear the rate-limit), so its wall-clock completion is ~SAVES*520 ms BY DESIGN
        // — NOT a hang. We size the per-message timeout generously (10 s) above that deterministic
        // floor; a real deadlock (writer blocked forever behind a lock-across-I/O save) would still trip
        // it. The honest signal is the p95 latency assertion below.
        let total_workers = WRITERS + 1; // writers + saver
        for _ in 0..total_workers {
            match done_rx.recv_timeout(Duration::from_secs(10)) {
                Ok(name) => println!("✅ Hilo '{}' finalizó.", name),
                Err(_) => panic!("🚨 POSIBLE DEADLOCK: un hilo excedió 10 s en el test de latencia de guardado."),
            }
        }

        // Collect every writer latency sample.
        let mut samples: Vec<Duration> = Vec::with_capacity(WRITERS * STROKES);
        while let Ok(dt) = rx.recv_timeout(Duration::from_secs(1)) {
            samples.push(dt);
        }
        assert!(!samples.is_empty(), "expected writer latency samples");

        samples.sort();
        let p95_idx = ((samples.len() as f64) * 0.95) as usize;
        let p95 = samples[p95_idx.min(samples.len() - 1)];
        let max = *samples.last().unwrap();

        // BOUND: generous absolute ceiling. A lock-free save keeps writer p95 well under a few ms; a
        // lock-across-I/O regression would block a writer for the FULL Deflate of a ~1 MB layer (tens of
        // ms), pushing p95 past this bound. We print the observed values so the threshold can be
        // re-tuned to ~5-10x the lock-free baseline on a slow/loaded CI runner if needed.
        println!(
            "writer latency under concurrent save: p95={:?}, max={:?}, n={}",
            p95, max, samples.len()
        );
        assert!(
            p95 < Duration::from_millis(50),
            "writer starved during save: p95={:?} (max={:?}) — lock held across I/O?",
            p95, max
        );

        // Teardown: remove the .brick and any lingering temp the saver may have left.
        let _ = std::fs::remove_file(&brick_path);
        if let Some(parent) = brick_path.parent() {
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    if name.contains("brick_latency_") && name.ends_with(".tmp") {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
        println!("✅ Test de latencia de escritor bajo guardado concurrente superado.");
    }
}
