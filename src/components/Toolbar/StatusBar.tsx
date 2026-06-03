// src/components/Toolbar/StatusBar.tsx
import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useStore";
import { FaPen, FaEraser, FaHistory, FaCompressArrowsAlt, FaSearchPlus, FaSearchMinus, FaGithub } from "react-icons/fa";

export const StatusBar = () => {
    // 🚀 FIX: Traemos setCamera para inyectar el nuevo zoom
    const { settings, canvasSize, camera, resetCamera, setCamera } = useAppStore();
    const [coords, setCoords] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleCoordsUpdate = (e: Event) => {
            const customEvent = e as CustomEvent;
            setCoords(customEvent.detail);
        };

        window.addEventListener("plynte-coords", handleCoordsUpdate);
        return () => window.removeEventListener("plynte-coords", handleCoordsUpdate);
    }, []);

    // 🚀 FUNCIÓN: Zoom con botones centrado en la pantalla
    const handleZoom = (factor: number) => {
        // Buscamos el centro visual del contenedor del lienzo
        const canvasEl = document.querySelector('canvas');
        const centerX = canvasEl ? canvasEl.clientWidth / 2 : window.innerWidth / 2;
        const centerY = canvasEl ? canvasEl.clientHeight / 2 : window.innerHeight / 2;

        let newZoom = camera.zoom * factor;
        newZoom = Math.max(0.1, Math.min(newZoom, 10)); // Límite 10% a 1000%

        // Matemática para mantener el centro estático
        const dx = centerX - camera.x;
        const dy = centerY - camera.y;

        const newX = centerX - dx * (newZoom / camera.zoom);
        const newY = centerY - dy * (newZoom / camera.zoom);

        setCamera({ zoom: newZoom, x: newX, y: newY });
    };

    return (
        <footer className="h-7 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between px-4 text-[10px] font-mono text-neutral-500 select-none z-20 shrink-0">
            <div className="flex items-center gap-6">
                <span className="flex gap-2">
                    <span>{settings.tool === "brush" ? <FaPen /> : <FaEraser />}</span>
                    <span className="uppercase text-neutral-400 font-bold tracking-wider">
                        {settings.tool} ({settings.size}px)
                    </span>
                </span>

                <span className="border-l border-neutral-800 pl-6 flex items-center gap-6">
                    <span>LIENZO: {canvasSize.width} x {canvasSize.height} px</span>

                    {/* 🚀 CRÉDITOS GITHUB */}
                    <a
                        href="https://github.com/plynte-labs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-sky-400 flex items-center gap-1.5 transition-colors text-neutral-400 font-bold tracking-wide border-l border-neutral-800 pl-6"
                    >
                        <FaGithub className="text-[11px]" /> BRICK.DRAW BY @PLYNTE-LABS
                    </a>

                    {/* 🚀 NUEVO: Panel de Navegación de Zoom */}
                    <div className="flex items-center gap-3 text-sky-500/80 bg-neutral-900 px-2 py-0.5 rounded-md border border-neutral-800">
                        <button
                            onClick={() => handleZoom(0.8)}
                            className="hover:text-white cursor-pointer transition-colors p-1"
                            title="Alejar"
                        >
                            <FaSearchMinus />
                        </button>
                        <span className="w-10 text-center font-bold">
                            {Math.round(camera.zoom * 100)}%
                        </span>
                        <button
                            onClick={() => handleZoom(1.2)}
                            className="hover:text-white cursor-pointer transition-colors p-1"
                            title="Acercar"
                        >
                            <FaSearchPlus />
                        </button>
                    </div>
                </span>
            </div>

            <div className="flex items-center gap-4 text-sky-500/80">
                <span>X: {coords.x.toString().padStart(4, "0")}</span>
                <span>Y: {coords.y.toString().padStart(4, "0")}</span>
            </div>

            <div className="flex items-center gap-4">
                <button onClick={() => {
                    const canvasEl = document.querySelector('canvas');
                    const w = canvasEl ? canvasEl.clientWidth : window.innerWidth;
                    const h = canvasEl ? canvasEl.clientHeight : window.innerHeight;
                    resetCamera(w, h);
                }} className="hover:text-white cursor-pointer text-sky-400 flex items-center gap-1 transition-colors uppercase tracking-widest">
                    <FaCompressArrowsAlt /> Centrar
                </button>
                <button className="hover:text-neutral-300 flex items-center gap-1 transition-colors uppercase tracking-widest">
                    <FaHistory /> Historial
                </button>
            </div>
        </footer>
    );
};
