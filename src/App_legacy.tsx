// // src/App.tsx
// import Toolbar from "./components/Toolbar/Toolbar";
// import { DrawingCanvas } from "./components/DrawingCanvas";
// import "./css/App.css";
// import { LayerPanel } from "./components/Toolbar/LayersPanel";
// import { useAppStore } from "./store/useStore";
// import { FaLayerGroup, FaMagic } from "react-icons/fa";
// import { useHotkeys } from "./hooks/useHotkeys";
// import { StatusBar } from "./components/Toolbar/StatusBar";
// import {  useState } from "react";
// import { AIPromptModal } from "./components/Toolbar/AIPromptModal";
// import { CanvasSetupModal } from './components/CanvasSetupModal';

// function App_Legacy() {
//   // 🚀 1. Extraemos los estados de inicialización y tamaño
//   const {
//     isLayerPanelOpen,
//     toggleLayerPanel,
//     isCanvasInitialized, // <-- NUEVO
//     initCanvas,          // <-- NUEVO
//   } = useAppStore();

//   const [isAIModalOpen, setIsAIModalOpen] = useState(false);

//   useHotkeys();

  

//   // ==========================================
//   // 🚀 2. LA MAGIA DEL RETORNO TEMPRANO
//   // Si no está inicializado, solo mostramos el Modal de configuración
//   // ==========================================
//   if (!isCanvasInitialized) {
//     return (
//       <div className="w-screen h-screen bg-neutral-950">
//         <CanvasSetupModal
//           onStart={(size) => {
//             // Cuando el usuario hace clic en "Crear Lienzo", guardamos el tamaño
//             // Esto cambiará isCanvasInitialized a true y hará que se renderice la app real.
//             initCanvas(size.width, size.height);
//           }}
//         />
//       </div>
//     );
//   }

//   // ==========================================
//   // 3. LA APP REAL (Solo se ejecuta si isCanvasInitialized es true)
//   // ==========================================
//   return (
//     <main className="flex flex-col w-screen h-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans select-none">
//       <div className="flex flex-1 overflow-hidden relative">
//         <Toolbar />

//         <section className="flex-1 flex flex-col min-w-0 bg-neutral-900">
//           <header className="shrink-0 h-12 border-b border-neutral-800 bg-neutral-900 flex items-center justify-between px-6 shadow-sm z-10">
//             <div className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
//               Brick.draw
//             </div>

//             <div className="flex items-center gap-3">
//               <button
//                 onClick={() => setIsAIModalOpen(true)}
//                 className="flex items-center cursor-pointer gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors bg-sky-900/40 text-sky-400 hover:bg-sky-800/60 border border-sky-800/50 shadow-[0_0_10px_rgba(14,165,233,0.1)]"
//               >
//                 <FaMagic className="text-sm" /> IA Engine
//               </button>

//               <button
//                 onClick={toggleLayerPanel}
//                 className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${isLayerPanelOpen
//                   ? 'bg-neutral-700 text-white shadow-md'
//                   : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
//                   }`}
//               >
//                 <FaLayerGroup className="text-sm" /> Capas
//               </button>
//             </div>
//           </header>

//           {/* El lienzo ahora ocupa el 100% del espacio y maneja su propia cámara */}
//           <div className="flex-1 w-full h-full overflow-hidden relative bg-neutral-900">
//              <DrawingCanvas />
//           </div>

//         </section>

//         {isLayerPanelOpen && <LayerPanel />}
//       </div>

//       <StatusBar />
//       {isAIModalOpen && <AIPromptModal onClose={() => setIsAIModalOpen(false)} />}

//     </main>
//   );
// }

// export default App_Legacy;