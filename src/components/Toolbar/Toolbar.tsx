// src/components/Toolbar/Toolbar.tsx (o index.tsx)
import React from 'react';
import { FaCircle } from 'react-icons/fa';
import { PropertySliders } from './PropertySliders';
import { ExportButton } from './ExportButton';
import { ImportImageButton } from './ImportImageButton';

const Toolbar: React.FC = () => {
    return (
        <aside className="w-64 h-screen bg-neutral-900 p-5 border-r border-neutral-800 flex flex-col gap-8 select-none shadow-2xl z-20">
            <div className="flex items-center gap-3 border-b border-neutral-800 pb-5">
                <FaCircle className="text-sky-500 text-xl" />
                <h2 className="text-lg font-bold tracking-tight text-neutral-100 uppercase">Brick.draw</h2>
            </div>

            <PropertySliders />
            <div className="mt-0 flex flex-col gap-2">
                <ImportImageButton />
                <ExportButton />
            </div>
        </aside>
    );
};

export default Toolbar;