// src/components/Toolbar/PropertySliders.tsx
import React from 'react';
import { MdOpacity, MdTimeline, MdGesture } from 'react-icons/md';
import { useAppStore } from '../../store/useStore';
import { PressureCurvePreset } from '../../hooks/engine/pressureCurve';

const PRESSURE_CURVE_OPTIONS: { value: PressureCurvePreset; label: string }[] = [
    { value: 'linear', label: 'Lineal' },
    { value: 'soft', label: 'Suave' },
    { value: 'hard', label: 'Dura' },
];

export const PropertySliders: React.FC = () => {
    const { settings, setSettings } = useAppStore();

    const updateSetting = (update: Partial<typeof settings>) => {
        setSettings(update);
    };

    return (
        <section className="flex flex-col gap-6 bg-neutral-800/30 p-4 rounded-2xl border border-neutral-800">
            {/* Color */}
            <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase mb-2 block">Pigmento</label>
                <div className="flex items-center gap-3 bg-neutral-900 p-2 rounded-lg border border-neutral-700">
                    <input
                        type="color"
                        value={settings.color}
                        onChange={(e) => updateSetting({ color: e.target.value })}
                        className="w-8 h-8 border-none bg-transparent cursor-pointer rounded"
                    />
                    <span className="text-xs font-mono text-neutral-400">{settings.color.toUpperCase()}</span>
                </div>
            </div>

            {/* Tamaño */}
            <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase mb-2 flex justify-between">
                    Calibre <span>{settings.size}px</span>
                </label>
                <input
                    type="range" min="1" max="150" value={settings.size}
                    onChange={(e) => updateSetting({ size: parseInt(e.target.value) })}
                    className="w-full cursor-grab h-1.5 bg-neutral-700 rounded-full appearance-none accent-sky-500"
                />
            </div>

            {/* Opacidad */}
            <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase mb-2 flex justify-between">
                    <div className="flex cursor-grab items-center gap-1"><MdOpacity /> Opacidad</div>
                    <span>{Math.round(settings.opacity * 100)}%</span>
                </label>
                <input
                    type="range" min="0.01" max="1" step="0.01" value={settings.opacity}
                    onChange={(e) => updateSetting({ opacity: parseFloat(e.target.value) })}
                    className="w-full cursor-grab h-1.5 bg-neutral-700 rounded-full appearance-none accent-sky-500"
                />
            </div>

            {/* Estabilizador */}
            <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase mb-2 flex justify-between">
                    <div className="flex items-center gap-1"><MdTimeline /> Suavizado</div>
                    <span>{Math.round(settings.smoothing * 100)}%</span>
                </label>
                <input
                    type="range" min="0" max="0.95" step="0.05" value={settings.smoothing}
                    onChange={(e) => updateSetting({ smoothing: parseFloat(e.target.value) })}
                    className="w-full cursor-grab h-1.5 bg-neutral-700 rounded-full appearance-none accent-sky-500"
                />
            </div>

            {/* Curva de presión */}
            <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase mb-2 flex items-center gap-1">
                    <MdGesture /> Curva de presión
                </label>
                <div className="flex gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-700">
                    {PRESSURE_CURVE_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateSetting({ pressureCurve: opt.value })}
                            className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                                settings.pressureCurve === opt.value
                                    ? 'bg-sky-500 text-white font-bold'
                                    : 'text-neutral-400 hover:bg-neutral-800'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
};