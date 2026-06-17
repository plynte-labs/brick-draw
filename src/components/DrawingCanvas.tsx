// src/components/DrawingCanvas.tsx
import { useRef, useEffect } from "react";
import { useAppStore } from "../store/useStore";
import { useDrawingEngine } from "../hooks/useDrawingEngine";
import { TransformGizmo } from "./TransformGizmo";

export const DrawingCanvas = () => {
    const { settings, camera, setCamera } = useAppStore();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cursorDivRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const { startDrawing, processPointerMove, selectionMaskRef, hasSelectionRef } =
        useDrawingEngine(canvasRef);

    const isTransform = settings.tool === "transform";

    // 🚀 ZOOM MATEMÁTICO (Dirigido hacia el ratón)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (!e.altKey) return;
            e.preventDefault();

            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomFactor = e.deltaY > 0 ? 0.90 : 1.15;
            let newZoom = camera.zoom * zoomFactor;
            newZoom = Math.max(0.1, Math.min(newZoom, 10)); // 10% a 1000%

            // Matemática para hacer zoom "hacia donde apunta el cursor"
            const dx = mouseX - camera.x;
            const dy = mouseY - camera.y;

            const newX = mouseX - dx * (newZoom / camera.zoom);
            const newY = mouseY - dy * (newZoom / camera.zoom);

            setCamera({ zoom: newZoom, x: newX, y: newY });
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [camera, setCamera]);

    // 🚀 PANEO CON CLICK CENTRAL, ALT + CLICK O ESPACIO + ARRASTRE
    const isPanning = useRef(false);
    const isSpacePressed = useRef(false);
    const lastPanPoint = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === " " && !e.repeat) {
                // Evitamos activar el paneo si estamos escribiendo en campos de texto (IA Prompts, etc.)
                const activeEl = document.activeElement;
                if (activeEl && (
                    activeEl.tagName === 'INPUT' || 
                    activeEl.tagName === 'TEXTAREA' || 
                    activeEl.getAttribute('contenteditable') === 'true'
                )) {
                    return;
                }
                e.preventDefault();
                isSpacePressed.current = true;
                if (containerRef.current && !isPanning.current) {
                    containerRef.current.style.cursor = 'grab';
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === " ") {
                isSpacePressed.current = false;
                if (containerRef.current && !isPanning.current) {
                    containerRef.current.style.cursor = 'crosshair';
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button === 2) return; // Escudo Anti-Click Derecho

        if (e.button === 1 || e.altKey || isSpacePressed.current) {
            isPanning.current = true;
            lastPanPoint.current = { x: e.clientX, y: e.clientY };
            if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
            return;
        }

        // Soporte de tableta: pasamos el tipo de puntero ('pen'/'mouse'/'touch') para resolver
        // la presión (lápiz = presión real → grosor variable; mouse = ancho completo).
        startDrawing(e.clientX, e.clientY, e.pressure || 0.5, e.pointerType);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isPanning.current) {
            const dx = e.clientX - lastPanPoint.current.x;
            const dy = e.clientY - lastPanPoint.current.y;
            setCamera({ x: camera.x + dx, y: camera.y + dy });
            lastPanPoint.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const container = containerRef.current; // Usamos el contenedor padre
        const cursor = cursorDivRef.current;
        if (!container || !cursor) return;

        // 🚀 FIX: Calculamos basado en el contenedor absoluto
        const rect = container.getBoundingClientRect();
        const visualSize = settings.size * camera.zoom;

        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;
        cursor.style.width = `${visualSize}px`;
        cursor.style.height = `${visualSize}px`;

        const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent];
        processPointerMove(events as PointerEvent[]);
    };

    useEffect(() => {
        const handleUp = () => {
            if (isPanning.current) {
                isPanning.current = false;
                if (containerRef.current) {
                    containerRef.current.style.cursor = isSpacePressed.current ? 'grab' : 'crosshair';
                }
            }
        };
        window.addEventListener('pointerup', handleUp);
        return () => window.removeEventListener('pointerup', handleUp);
    }, []);

    return (
        // 🚀 Contenedor limpio, el canvas ocupa el 100% de la pantalla
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-neutral-900 cursor-crosshair">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full touch-none"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => {
                    if (cursorDivRef.current) cursorDivRef.current.style.transform = 'translate(-9999px, -9999px)';
                }}
            />
            {/* The brush ring cursor is irrelevant in transform mode; hide it so it
                does not float over the gizmo handles. */}
            {!isTransform && (
                <div
                    ref={cursorDivRef}
                    className="pointer-events-none absolute top-0 left-0 rounded-full border border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)] z-[100] will-change-transform"
                    style={{
                        backgroundColor: settings.tool === 'eraser' ? 'rgba(255,255,255,0.4)' : `${settings.color}33`,
                        transform: 'translate(-9999px, -9999px)'
                    }}
                />
            )}
            {/* Transform gizmo overlay: mounts only while the transform tool is
                active. On unmount it cancels (touches nothing in the store/layer). */}
            {isTransform && (
                <TransformGizmo
                    canvasRef={canvasRef}
                    selectionMaskRef={selectionMaskRef}
                    hasSelectionRef={hasSelectionRef}
                />
            )}
        </div>
    );
};