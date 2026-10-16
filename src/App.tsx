import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { BottomTabBar } from './components/BottomTabBar';
import { GPSRunner } from './components/GPSRunner';
import { HIITTimer } from './components/HIITTimer';
import { HistoryDashboard } from './components/HistoryDashboard';
import { StoryGenerator } from './components/StoryGenerator';
import { Workout } from './types/workout';
import { getStoredWorkouts } from './services/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState<'gps' | 'hiit' | 'history' | 'story'>('gps');
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [storyWorkout, setStoryWorkout] = useState<Workout | null>(null);

  // Load workouts from localStorage on mount
  useEffect(() => {
    const stored = getStoredWorkouts();
    setWorkouts(stored);
    if (stored.length > 0) {
      setStoryWorkout(stored[0]);
    }
  }, []);

  const handleWorkoutCompleted = (newWorkout: Workout) => {
    setWorkouts((prev) => [newWorkout, ...prev.filter((w) => w.id !== newWorkout.id)]);
    setStoryWorkout(newWorkout);
  };

  const handleOpenStoryWithWorkout = (workout: Workout) => {
    setStoryWorkout(workout);
    setActiveTab('story');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100 font-sans pb-16 md:pb-0">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 w-full">
        {activeTab === 'gps' && (
          <GPSRunner
            onWorkoutCompleted={handleWorkoutCompleted}
            onOpenStory={handleOpenStoryWithWorkout}
          />
        )}

        {activeTab === 'hiit' && (
          <HIITTimer
            onWorkoutCompleted={handleWorkoutCompleted}
            onOpenStory={handleOpenStoryWithWorkout}
          />
        )}

        {activeTab === 'history' && (
          <HistoryDashboard
            workouts={workouts}
            onWorkoutsUpdated={setWorkouts}
            onOpenStory={handleOpenStoryWithWorkout}
          />
        )}

        {activeTab === 'story' && (
          <StoryGenerator
            workout={storyWorkout}
            onBack={() => setActiveTab('history')}
          />
        )}
      </main>

      {/* Ergonomic Mobile Bottom Tab Navigation */}
      <BottomTabBar activeTab={activeTab} onSelectTab={setActiveTab} />
    </div>
  );
}
