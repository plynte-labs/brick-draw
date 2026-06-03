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
                title: 'Export Masterpiece',
                defaultPath: 'My_Plynte_Art.png',
                filters: [{ name: 'PNG Image', extensions: ['png'] }]
            });

            if (!resSave.success || !resSave.data) return;

            const resGuardar = await guardarDibujo(resSave.data);
            if (!resGuardar.success) throw new Error(resGuardar.error);
            alert(resGuardar.data);

        } catch (error) {
            console.error(error);
            alert("Error exporting: " + error);
        }
    };

    const handleSaveProject = async () => {
        try {
            const resSave = await saveFileDialog({
                title: 'Save Layer Project',
                defaultPath: 'Canvas_Project.brick',
                filters: [{ name: 'Brick-Draw Project', extensions: ['brick'] }]
            });

            if (!resSave.success || !resSave.data) return;

            const success = await saveProject(resSave.data);
            if (success) {
                alert(".brick project saved successfully!");
            }
        } catch (error) {
            console.error(error);
            alert("Error saving project: " + error);
        }
    };

    const handleLoadProject = async () => {
        try {
            const resOpen = await openFileDialog({
                title: 'Open Layer Project',
                filters: [{ name: 'Brick-Draw Project', extensions: ['brick'] }]
            });

            if (!resOpen.success || !resOpen.data) return;

            const success = await loadProject(resOpen.data);
            if (success) {
                alert(".brick project loaded successfully!");
            }
        } catch (error) {
            console.error(error);
            alert("Error loading project: " + error);
        }
    };

    return (
        <div className="mt-0 pt-6 border-t border-neutral-800 flex flex-col gap-3">
            {/* Fila superior: Controles de Proyecto */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={handleSaveProject}
                    className="flex items-center cursor-pointer justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white p-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-md active:scale-95"
                    title="Save .brick project with layers"
                >
                    <FaSave className="text-xs" /> Save
                </button>
                <button
                    onClick={handleLoadProject}
                    className="flex items-center cursor-pointer justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white p-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-md active:scale-95"
                    title="Open .brick project with layers"
                >
                    <FaFolderOpen className="text-xs" /> Open
                </button>
            </div>

            {/* Fila inferior: Exportación */}
            <button
                onClick={handleExport}
                className="w-full flex items-center cursor-pointer justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-600 p-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-lg active:scale-95"
            >
                <FaDownload className="text-xs text-indigo-400" /> Export PNG
            </button>
        </div>
    );
};
