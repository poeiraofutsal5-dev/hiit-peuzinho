import React from 'react';
import { Navigation, Timer, Activity, Sparkles } from 'lucide-react';

interface BottomTabBarProps {
  activeTab: 'gps' | 'hiit' | 'history' | 'story';
  onSelectTab: (tab: 'gps' | 'hiit' | 'history' | 'story') => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ activeTab, onSelectTab }) => {
  const tabs = [
    {
      id: 'gps' as const,
      label: 'Corrida GPS',
      icon: Navigation,
    },
    {
      id: 'hiit' as const,
      label: 'HIIT Timer',
      icon: Timer,
    },
    {
      id: 'history' as const,
      label: 'Histórico',
      icon: Activity,
    },
    {
      id: 'story' as const,
      label: 'Story',
      icon: Sparkles,
    },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F17]/95 backdrop-blur-xl border-t border-slate-800 pb-safe">
      <div className="grid grid-cols-4 items-center h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className="flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] cursor-pointer transition-colors"
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all ${
                  isActive ? 'bg-[#FC5200] text-white shadow-md shadow-orange-500/25' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[10px] font-semibold mt-1 tracking-tight ${
                  isActive ? 'text-[#FC5200]' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
