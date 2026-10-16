import React, { useState } from 'react';
import { Download, Volume2, VolumeX, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { soundFx } from '../services/audioEngine';

interface NavbarProps {
  activeTab: 'gps' | 'hiit' | 'history' | 'story';
  onSelectTab: (tab: 'gps' | 'hiit' | 'history' | 'story') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isMuted, setIsMuted] = useState(soundFx.getMuted());

  const handleToggleSound = () => {
    const next = soundFx.toggleMuted();
    setIsMuted(next);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2">
          <div
            onClick={() => onSelectTab('gps')}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#FC5200] to-orange-400 flex items-center justify-center shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform">
              <span className="font-black text-white text-xs tracking-wider">P</span>
            </div>
            <span className="text-lg font-black tracking-tight text-white whitespace-nowrap shrink-0">
              PULSE<span className="text-[#FC5200]">.</span>
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links (Desktop/Tablet) */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-300">
          <button
            onClick={() => onSelectTab('gps')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 ${
              activeTab === 'gps'
                ? 'text-[#FC5200] border-b-2 border-[#FC5200]'
                : 'hover:text-white'
            }`}
          >
            Corrida GPS
          </button>
          <button
            onClick={() => onSelectTab('hiit')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 ${
              activeTab === 'hiit'
                ? 'text-[#FC5200] border-b-2 border-[#FC5200]'
                : 'hover:text-white'
            }`}
          >
            HIIT &amp; Tabata
          </button>
          <button
            onClick={() => onSelectTab('history')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 ${
              activeTab === 'history'
                ? 'text-[#FC5200] border-b-2 border-[#FC5200]'
                : 'hover:text-white'
            }`}
          >
            Histórico &amp; Stats
          </button>
          <button
            onClick={() => onSelectTab('story')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 ${
              activeTab === 'story'
                ? 'text-[#FC5200] border-b-2 border-[#FC5200]'
                : 'hover:text-white'
            }`}
          >
            Gerador de Story
          </button>
        </nav>

        {/* Zone 3: Actions (Sound & Install) */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleToggleSound}
            title={isMuted ? 'Ativar Áudio' : 'Desativar Áudio'}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#161D2D] hover:bg-[#1E273D] border border-slate-800 text-slate-300 transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* In-App PWA Install UI */}
          {isInstallable && !isInstalled && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Instalar App</span>
            </button>
          )}

          {isIOS && !isInstalled && (
            <button
              onClick={() => setShowIOSGuide(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5 text-orange-400" />
              <span>Instalar</span>
            </button>
          )}
        </div>
      </div>

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#161D2D] border border-slate-700 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white mb-2">Instalar no iPhone / iPad</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              1. Toque no botão de <strong>Compartilhar</strong> na barra do Safari.<br />
              2. Role a lista e selecione <strong>Adicionar à Tela de Início</strong>.<br />
              3. O PULSE será instalado como aplicativo nativo sem anúncios!
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-bold text-xs"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
