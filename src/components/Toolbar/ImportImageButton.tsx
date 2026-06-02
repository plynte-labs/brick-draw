// src/components/Toolbar/ImportImageButton.tsx
import React, { useRef } from 'react';
import { FaImage } from 'react-icons/fa';
import { useAppStore } from '../../store/useStore';
import { anadirCapa, cargarPngEnCapa } from '../../services/tauriService';

export const ImportImageButton: React.FC = () => {
    // Usamos un ref para poder resetear el input y permitir subir la misma imagen dos veces seguidas
    const fileInputRef = useRef<HTMLInputElement>(null);

    const importarImagenLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const store = useAppStore.getState();
            const { width: canvasW, height: canvasH } = store.canvasSize;

            // 1. Leemos el archivo físico
            const imgBitmap = await createImageBitmap(file);

            // 2. Creamos una capa nueva para esta imagen
            const nuevoId = `layer-img-${Date.now()}`;
            const resAnadir = await anadirCapa(nuevoId, canvasW, canvasH);
            if (!resAnadir.success) throw new Error(resAnadir.error);

            store.setLayers([
                ...store.layers,
                {
                    id: nuevoId,
                    name: `IMG: ${file.name.substring(0, 8)}`,
                    visible: true,
                    opacity: 1.0,
                    buffer: new OffscreenCanvas(canvasW, canvasH),
                    locked: false,
                    x: 0,
                    y: 0
                }
            ]);
            store.setActiveLayer(nuevoId);

            // 3. Dibujamos en React ajustando la escala sin deformar (Contain)
            const updatedStore = useAppStore.getState();
            const nuevaCapa = updatedStore.layers.find((l) => l.id === nuevoId);

            if (nuevaCapa) {
                const ctx = nuevaCapa.buffer.getContext("2d");
                if (ctx) {
                    const scale = Math.min(canvasW / imgBitmap.width, canvasH / imgBitmap.height);
                    const drawW = imgBitmap.width * scale;
                    const drawH = imgBitmap.height * scale;
                    const drawX = (canvasW - drawW) / 2;
                    const drawY = (canvasH - drawH) / 2;

                    ctx.drawImage(imgBitmap, drawX, drawY, drawW, drawH);

                    // 4. Sincronizamos con Rust
                    const canvasBlob = await nuevaCapa.buffer.convertToBlob({ type: "image/png" });
                    const arrayBuffer = await canvasBlob.arrayBuffer();

                    const resCargar = await cargarPngEnCapa(nuevoId, new Uint8Array(arrayBuffer));
                    if (!resCargar.success) throw new Error(resCargar.error);

                    store.forceRender();
                }
            }
        } catch (error) {
            console.error("Error importando imagen:", error);
        } finally {
            // Reseteamos el input para que detecte si subes el mismo archivo de nuevo
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <label className="flex items-center justify-center gap-2 p-3 mt-2 rounded-xl border transition-all duration-150 cursor-pointer bg-neutral-800 border-neutral-700 hover:bg-neutral-700/50 text-neutral-200">
            <FaImage className="text-xl text-sky-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Importar Img</span>
            <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
                onChange={importarImagenLocal}
                ref={fileInputRef}
            />
        </label>
    );
};