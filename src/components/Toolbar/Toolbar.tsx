// src/components/Toolbar/Toolbar.tsx
import React from 'react';
import { PropertySliders } from './PropertySliders';
import { ExportButton } from './ExportButton';
import { ImportImageButton } from './ImportImageButton';

const Toolbar: React.FC = () => {
    return (
        <aside className="w-64 h-full bg-neutral-900 p-5 border-r border-neutral-800 flex flex-col gap-6 select-none shadow-2xl z-20 overflow-y-auto">
            <PropertySliders />
            <div className="mt-auto flex flex-col gap-2 pt-4">
                <ImportImageButton />
                <ExportButton />
            </div>
        </aside>
    );
};

export default Toolbar;