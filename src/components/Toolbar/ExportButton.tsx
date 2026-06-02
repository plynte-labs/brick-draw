// src/components/Toolbar/ExportButton.tsx
import React from 'react';
import { saveFileDialog, openFileDialog, guardarDibujo } from "../../services/tauriService";
import { FaDownload, FaSave, FaFolderOpen } from 'react-icons/fa';
import { useAppStore } from '../../store/useStore';

export const ExportButton: React.FC = () => {
    const { saveProject, loadProject } = useAppStore();

    const handleExport = async () => {
        try {
            const resSave = await saveFileDialog({
                title: 'Exportar Obra Maestra',
                defaultPath: 'Mi_Arte_Plynte.png',
                filters: [{ name: 'Imagen PNG', extensions: ['png'] }]
            });

            if (!resSave.success || !resSave.data) return;

            const resGuardar = await guardarDibujo(resSave.data);
            if (!resGuardar.success) throw new Error(resGuardar.error);
            alert(resGuardar.data);

        } catch (error) {
            console.error(error);
            alert("Hubo un error al exportar: " + error);
        }
    };

    const handleSaveProject = async () => {
        try {
            const resSave = await saveFileDialog({
                title: 'Guardar Proyecto de Capas',
                defaultPath: 'Lienzo_Proyecto.brick',
                filters: [{ name: 'Proyecto Brick-Draw', extensions: ['brick'] }]
            });

            if (!resSave.success || !resSave.data) return;

            const success = await saveProject(resSave.data);
            if (success) {
                alert("¡Proyecto .brick guardado con éxito!");
            }
        } catch (error) {
            console.error(error);
            alert("Hubo un error al guardar el proyecto: " + error);
        }
    };

    const handleLoadProject = async () => {
        try {
            const resOpen = await openFileDialog({
                title: 'Abrir Proyecto de Capas',
                filters: [{ name: 'Proyecto Brick-Draw', extensions: ['brick'] }]
            });

            if (!resOpen.success || !resOpen.data) return;

            const success = await loadProject(resOpen.data);
            if (success) {
                alert("¡Proyecto .brick cargado con éxito!");
            }
        } catch (error) {
            console.error(error);
            alert("Hubo un error al cargar el proyecto: " + error);
        }
    };

    return (
        <div className="mt-0 pt-6 border-t border-neutral-800 flex flex-col gap-3">
            {/* Fila superior: Controles de Proyecto */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={handleSaveProject}
                    className="flex items-center cursor-pointer justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white p-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-md active:scale-95"
                    title="Guardar archivo .brick con capas"
                >
                    <FaSave className="text-xs" /> Guardar
                </button>
                <button
                    onClick={handleLoadProject}
                    className="flex items-center cursor-pointer justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white p-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-md active:scale-95"
                    title="Abrir archivo .brick con capas"
                >
                    <FaFolderOpen className="text-xs" /> Abrir
                </button>
            </div>

            {/* Fila inferior: Exportación */}
            <button
                onClick={handleExport}
                className="w-full flex items-center cursor-pointer justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-600 p-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-lg active:scale-95"
            >
                <FaDownload className="text-xs text-indigo-400" /> Exportar PNG
            </button>
        </div>
    );
};