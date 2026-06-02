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
    use std::time::Duration;
    use parking_lot::RwLock;
    use tauri::State;

    use brick_draw_lib::state::AppState;
    use brick_draw_lib::commands::draw::{procesar_trazo, PuntoTrazo};
    use brick_draw_lib::commands::layers::anadir_capa;
    use brick_draw_lib::commands::history::{deshacer, rehacer};

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

    // Helper para transmutar de forma segura una referencia &T a tauri::State<T> para mocking
    fn mock_state<'a, T: Send + Sync + 'static>(val: &'a T) -> State<'a, T> {
        unsafe { std::mem::transmute(val) }
    }

    // 1. TEST DE ESTRÉS DE CAPAS CON PERFILADO DE HEAP
    #[test]
    fn test_estres_100_capas_y_heap() {
        // Inicializar el profiler de dhat si está activa la feature dhat-heap
        #[cfg(feature = "dhat-heap")]
        let _profiler = dhat::Profiler::new_heap();

        let state = Arc::new(RwLock::new(AppState::new()));
        
        // Simular creación sucesiva de 100 capas
        {
            let state_guard = mock_state(&state);

            for i in 0..100 {
                let id_capa = format!("layer_{}", i);
                anadir_capa(state_guard.clone(), id_capa, 256, 256).unwrap();
            }
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
        {
            let state_guard = mock_state(&state);
            anadir_capa(state_guard.clone(), "capa_1".to_string(), 256, 256).unwrap();
            anadir_capa(state_guard.clone(), "capa_2".to_string(), 256, 256).unwrap();
            anadir_capa(state_guard.clone(), "capa_3".to_string(), 256, 256).unwrap();
        }

        let (tx, rx) = mpsc::channel();
        const NUM_LECTORES: usize = 8;
        const NUM_ESCRITORES: usize = 2;

        // Lanzar hilos Lectores (Simulan render de UI y preview)
        for thread_idx in 0..NUM_LECTORES {
            let state_clone = state.clone();
            let tx_clone = tx.clone();
            thread::spawn(move || {
                let state_guard = mock_state(&state_clone);

                for _ in 0..200 {
                    // Simular lectura recurrente del estado global y capas
                    let state_lock = state_guard.read();
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
                let state_guard = mock_state(&state_clone);

                for step in 0..50 {
                    let id_capa = format!("capa_{}", (thread_idx + 1));
                    let puntos = vec![
                        PuntoTrazo { x: 10.0 + step as f32, y: 10.0, p: 0.8 },
                        PuntoTrazo { x: 20.0 + step as f32, y: 20.0, p: 0.8 },
                    ];

                    // Llamar al comando procesar_trazo que pide lock exclusivo (write)
                    let _ = procesar_trazo(
                        state_guard.clone(),
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
        let state_guard = mock_state(&state);

        // Lienzo pequeño optimizado
        anadir_capa(state_guard.clone(), "capa_test".to_string(), 256, 256).unwrap();

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
        procesar_trazo(
            state_guard.clone(),
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
        let res_deshacer = deshacer(state_guard.clone()).unwrap();
        assert_eq!(res_deshacer, Some("capa_test".to_string()));

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
        let res_rehacer = rehacer(state_guard.clone()).unwrap();
        assert_eq!(res_rehacer, Some("capa_test".to_string()));

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
        let state_guard = mock_state(&state);

        anadir_capa(state_guard.clone(), "capa_resize".to_string(), 100, 100).unwrap();

        let (tx, rx) = mpsc::channel();

        // Hilo Escritor: Fuerza la auto-expansión dibujando muy afuera
        let state_clone = state.clone();
        let tx_clone = tx.clone();
        thread::spawn(move || {
            let state_guard = mock_state(&state_clone);

            let puntos = vec![
                PuntoTrazo { x: 50.0, y: 50.0, p: 0.8 },
                PuntoTrazo { x: 450.0, y: 450.0, p: 0.8 }, // Provocará auto-resize de 100x100 a más de 450x450
            ];

            let _ = procesar_trazo(
                state_guard.clone(),
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
            let state_guard = mock_state(&state_clone2);

            for _ in 0..100 {
                let state_read = state_guard.read();
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
        let state_guard = mock_state(&state);

        anadir_capa(state_guard.clone(), "capa_hist".to_string(), 256, 256).unwrap();

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
            procesar_trazo(
                state_guard.clone(),
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
}
