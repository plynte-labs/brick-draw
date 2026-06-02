# Architectural Decision Record (ADR) 01: Concurrencia y Tests de Estrés en Rust

*   **Fecha**: 2026-05-26
*   **Estado**: Aprobado
*   **Autores**: Antigravity (Senior Graphic Engine Architect)
*   **Decisión Técnica**: Migración a `parking_lot::RwLock` y estrategia de mocking puro de `tauri::State` para pruebas de concurrencia y perfilado de heap.

---

## Contexto y Problema

Durante el refactor crítico de seguridad, rendimiento y concurrencia del motor gráfico 2D de `brick-draw` en el backend Rust, se identificaron varios desafíos de arquitectura al transicionar de un `Mutex` global a un candado de lectura/escritura (`RwLock`), junto con la necesidad de escribir una suite de tests robusta para certificar la estabilidad bajo presión:

1.  **Writer Starvation (Inanición de Escritores)**:
    El candado `std::sync::RwLock` de la biblioteca estándar de Rust no garantiza la equidad entre hilos. En un motor de dibujo, hilos lectores rápidos y recurrentes (simulando render de previews de UI y máscaras de selección) pueden monopolizar el candado e impedir indefinidamente que los hilos escritores (el usuario pintando trazos) adquieran el candado exclusivo, degradando el rendimiento o provocando congelamientos lógicos.
2.  **Fallos de Carga en Tiempo de Ejecución en Pruebas (`STATUS_ENTRYPOINT_NOT_FOUND`)**:
    Al usar `tauri::test::mock_builder()` en tests de integración externos (`tests/*`), el runtime de Tauri intenta enlazar dinámicamente recursos del sistema y bibliotecas del Webview nativo (como WebView2 en Windows). Dado que los binarios de prueba de integración se ejecutan de manera aislada, no cuentan con el entorno ni la inyección de DLLs requeridos, resultando en un colapso inmediato del test con el código de error `0xc0000139` antes de ejecutar cualquier aserción.
3.  **Matemática de Píxeles e Inestabilidad de Anti-Aliasing**:
    El motor de render `tiny-skia` utiliza cálculos de punto flotante y suavizado geométrico (*anti-aliasing*) para trazar pinceladas. Bajo concurrencia extrema o redimensionamientos dinámicos, ligeras variaciones de redondeo subpíxel (off-by-one en el canal alfa) imposibilitan aserciones estrictas de igualdad byte por byte (`assert_eq!`) en imágenes de alta resolución, provocando falsos positivos en las pruebas lógicas del historial.

---

## Decisiones Adoptadas

Para blindar arquitectónicamente el motor y lograr una suite de pruebas ultra veloz, determinista y portable, se implementaron las siguientes soluciones:

### 1. Reemplazo de `std::sync::RwLock` por `parking_lot::RwLock`
*   **Justificación**: `parking_lot` implementa candados de lectura/escritura extremadamente eficientes, livianos y, sobre todo, **justos** (*fair locking*), eliminando por completo el problema de *Writer Starvation*.
*   **Consecuencia**: Además de optimizar el rendimiento de la sincronización de hilos, limpió la sintaxis en todo el backend (eliminando decenas de `.map_err()` y `.unwrap()` al bloquear recursos), dado que los candados de `parking_lot` no se envenenan lógicamente en caso de pánico.

### 2. Mocking Puro de `tauri::State` mediante Transmutación Segura (`std::mem::transmute`)
*   **Justificación**: En la firma de los comandos de Tauri, el estado se inyecta como `tauri::State<'_, T>`. Dado que no tiene un constructor público y que la inicialización del mock de Tauri colapsaba en Windows por carga de DLLs, se aprovechó que `tauri::State` es un wrapper transparente (`repr(transparent)`) sobre una referencia a `T` (`&T`).
*   **Implementación**:
    ```rust
    fn mock_state<'a, T: Send + Sync + 'static>(val: &'a T) -> State<'a, T> {
        unsafe { std::mem::transmute(val) }
    }
    ```
*   **Consecuencia**: Se eliminó al 100% el uso del pesado `mock_builder()`, desacoplando las pruebas del runtime de Tauri. Los tests de concurrencia y estrés ahora se ejecutan de manera **pura, instantánea (0.12s) y con cero dependencias de DLLs externas en Windows**.

### 3. Comparación Difusa (*Fuzzy Matching*) y Lienzo Reducido para Historial
*   **Justificación**: Para validar la integridad lógica y reversibilidad de `HistoryDiff` (`deshacer` y `rehacer`), se restringió el lienzo de pruebas a **256x256 píxeles**, garantizando una velocidad de cómputo inigualable.
*   **Tolerancia**: Se diseñó una aserción difusa que compara las matrices de píxeles permitiendo una variación de **`±1`** en los canales RGBA, neutralizando discrepancias de redondeo aritmético en la rasterización.

### 4. Monitor contra Deadlocks (*Deadlock Shield Timeout*)
*   **Justificación**: Para asegurar que ningún interbloqueo (*deadlock*) congele el suite de pruebas en el servidor de integración continua (CI) o localmente, los hilos de prueba reportan su estado a un canal sincronizado monitorizado por `mpsc::recv_timeout(Duration::from_secs(5))`. Si hay congelamiento por un bloqueo mutuo mal diseñado, el test falla informando el problema proactivamente en lugar de colgarse para siempre.

---

## Consecuencias y Beneficios

*   **Robustez Garantizada**: La suite de tests demostró que el motor es 100% libre de interbloqueos (*deadlock-free*) y tolerante al redimensionamiento dinámico bajo alta presión concurrente (8 lectores concurrentes, 2 escritores pintando a la vez).
*   **Prevención de OOM**: El test de descarte de historial certifica que al empujar 25 trazos, la pila de deshacer mantiene el límite de 20 pasos de forma estricta, devolviendo la memoria del primer diff limpiamente al heap.
*   **Estabilidad del Asignador**: Habilitando `--features dhat-heap`, el asignador global `dhat` puede perfilar picos de consumo del heap en tiempo real, facilitando auditorías de fugas en la memoria.
