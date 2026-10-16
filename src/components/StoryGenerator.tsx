import React, { useState, useRef, useEffect } from 'react';
import { Download, Share2, Upload, Image as ImageIcon, Sliders, ChevronLeft, Check, Sparkles, Type, Edit3 } from 'lucide-react';
import { Workout, GPSWorkout, HIITWorkout } from '../types/workout';
import { formatDurationStory, formatPaceShort, projectCoordinatesToCanvas } from '../utils/geo';
import { SAMPLE_ROUTE_COORDS, getStoredWorkouts } from '../services/storage';

interface StoryGeneratorProps {
  workout: Workout | null;
  onBack?: () => void;
}

const PRESET_BACKGROUNDS = [
  {
    id: 'forest-trail',
    name: 'Trilha & Natureza',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23132A13"/><stop offset="50%" stop-color="%2331572C"/><stop offset="100%" stop-color="%234F772D"/></linearGradient></defs><rect width="1080" height="1920" fill="url(%23g)"/><circle cx="540" cy="800" r="420" fill="%2390A955" opacity="0.15" filter="blur(60px)"/><circle cx="300" cy="1400" r="350" fill="%23ECF39E" opacity="0.1" filter="blur(80px)"/></svg>',
  },
  {
    id: 'golden-hour',
    name: 'Pôr do Sol',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%231F1D36"/><stop offset="40%" stop-color="%23864879"/><stop offset="70%" stop-color="%23E9A6A6"/></linearGradient></defs><rect width="1080" height="1920" fill="url(%23g)"/><circle cx="540" cy="700" r="450" fill="%23F4B183" opacity="0.3" filter="blur(90px)"/></svg>',
  },
  {
    id: 'dark-asphalt',
    name: 'Asfalto Noturno',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230F172A"/><stop offset="60%" stop-color="%231E293B"/><stop offset="100%" stop-color="%230F172A"/></linearGradient></defs><rect width="1080" height="1920" fill="url(%23g)"/><circle cx="540" cy="960" r="380" fill="%23FC5200" opacity="0.12" filter="blur(100px)"/></svg>',
  },
];

export const StoryGenerator: React.FC<StoryGeneratorProps> = ({ workout: initialWorkout, onBack }) => {
  const [availableWorkouts, setAvailableWorkouts] = useState<Workout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(initialWorkout);

  // Load workouts on mount
  useEffect(() => {
    const list = getStoredWorkouts();
    setAvailableWorkouts(list);
    if (!initialWorkout && list.length > 0) {
      setSelectedWorkout(list[0]);
    }
  }, [initialWorkout]);

  // Determine current workout metrics
  const isGps = !selectedWorkout || selectedWorkout.type === 'running' || selectedWorkout.type === 'cycling' || selectedWorkout.type === 'walking';
  const gpsWorkout = isGps ? (selectedWorkout as GPSWorkout | null) : null;

  // Real or initial zero values
  const defaultDist = gpsWorkout && gpsWorkout.distanceMeters > 0
    ? (gpsWorkout.distanceMeters / 1000).toFixed(2).replace('.', ',') + ' km'
    : '0,00 km';

  const defaultPace = gpsWorkout && gpsWorkout.avgPaceSecondsPerKm > 0
    ? formatPaceShort(gpsWorkout.avgPaceSecondsPerKm)
    : '0:00 /km';

  const defaultDuration = selectedWorkout && selectedWorkout.durationSeconds > 0
    ? formatDurationStory(selectedWorkout.durationSeconds)
    : '0s';

  // Custom editable fields for the story
  const [customDistance, setCustomDistance] = useState<string>(defaultDist);
  const [customPace, setCustomPace] = useState<string>(defaultPace);
  const [customDuration, setCustomDuration] = useState<string>(defaultDuration);

  // Sync when selected workout changes
  useEffect(() => {
    if (selectedWorkout) {
      const isRun = selectedWorkout.type === 'running' || selectedWorkout.type === 'cycling' || selectedWorkout.type === 'walking';
      const gps = isRun ? (selectedWorkout as GPSWorkout) : null;
      if (gps && gps.distanceMeters > 0) {
        setCustomDistance((gps.distanceMeters / 1000).toFixed(2).replace('.', ',') + ' km');
        setCustomPace(gps.avgPaceSecondsPerKm > 0 ? formatPaceShort(gps.avgPaceSecondsPerKm) : '0:00 /km');
        setCustomDuration(formatDurationStory(gps.durationSeconds));
      } else {
        setCustomDistance('0,00 km');
        setCustomPace('0:00 /km');
        setCustomDuration(selectedWorkout.durationSeconds > 0 ? formatDurationStory(selectedWorkout.durationSeconds) : '0s');
      }
    } else {
      setCustomDistance('0,00 km');
      setCustomPace('0:00 /km');
      setCustomDuration('0s');
    }
  }, [selectedWorkout]);

  // Customization controls
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>(PRESET_BACKGROUNDS[0].url);
  const [blurAmount, setBlurAmount] = useState<number>(14); // in px
  const [dimAmount, setDimAmount] = useState<number>(35); // in %
  const [brandStyle, setBrandStyle] = useState<'PULSE' | 'NONE' | 'CUSTOM'>('PULSE');
  const [customBrandText, setCustomBrandText] = useState<string>('PULSE');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Handle User Uploaded Image from Gallery
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setBackgroundImageUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * High-Precision Responsive Canvas Renderer.
   * Every single coordinate, font size and margin is calculated proportionally using `scale = width / 1080`
   * ensuring that 360x640 preview and 1080x1920 export have the EXACT same visual proportions with ZERO overlapping!
   */
  const drawStoryToCanvas = (
    canvas: HTMLCanvasElement,
    width: number = 1080,
    height: number = 1920
  ): Promise<void> => {
    return new Promise((resolve) => {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve();

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Proportional scale factor based on 1080 baseline
      const scale = width / 1080;

      // 1. Draw Background Image with Blur Effect
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Apply Canvas Blur filter scaled
        ctx.save();
        ctx.filter = `blur(${Math.round(blurAmount * scale * 2.2)}px)`;

        // Cover-fit image calculation
        const hRatio = width / img.width;
        const vRatio = height / img.height;
        const ratio = Math.max(hRatio, vRatio);
        const centerShiftX = (width - img.width * ratio) / 2;
        const centerShiftY = (height - img.height * ratio) / 2;

        ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);
        ctx.restore();

        // 2. Darkness Scrim Overlay
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${dimAmount / 100})`;
        ctx.fillRect(0, 0, width, height);

        // Subtle gradient vignette from center
        const gradient = ctx.createRadialGradient(width / 2, height / 2, width * 0.15, width / 2, height / 2, width * 0.9);
        gradient.addColorStop(0, 'rgba(0,0,0,0.05)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();

        // 3. Render Minimalist Typography with Proportional Spacing (ZERO OVERLAPPING)
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Proportional Fonts
        const labelFontSize = Math.round(32 * scale);
        const valueFontSize = Math.round(62 * scale);
        const labelFont = `600 ${labelFontSize}px 'Outfit', sans-serif`;
        const valueFont = `800 ${valueFontSize}px 'Outfit', sans-serif`;

        // Exact vertical anchors spaced out cleanly
        const yDistLabel = height * 0.17;
        const yDistVal = yDistLabel + 48 * scale;

        const yPaceLabel = height * 0.28;
        const yPaceVal = yPaceLabel + 48 * scale;

        const yTimeLabel = height * 0.39;
        const yTimeVal = yTimeLabel + 48 * scale;

        // --- Metric 1: Distância ---
        ctx.font = labelFont;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8 * scale;
        ctx.fillText('Distância', width / 2, yDistLabel);

        ctx.font = valueFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 14 * scale;
        ctx.fillText(customDistance, width / 2, yDistVal);

        // --- Metric 2: Ritmo ---
        ctx.font = labelFont;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8 * scale;
        ctx.fillText('Ritmo', width / 2, yPaceLabel);

        ctx.font = valueFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 14 * scale;
        ctx.fillText(customPace, width / 2, yPaceVal);

        // --- Metric 3: Tempo ---
        ctx.font = labelFont;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8 * scale;
        ctx.fillText('Tempo', width / 2, yTimeLabel);

        ctx.font = valueFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 14 * scale;
        ctx.fillText(customDuration, width / 2, yTimeVal);

        ctx.restore();

        // 4. Render Orange Route Silhouette (O Trajeto)
        // Positioned safely between y = height * 0.52 and height * 0.77
        ctx.save();
        const routeWidth = width * 0.58;
        const routeHeight = height * 0.20;
        const routeCenterY = height * 0.65;

        // Choose coordinates: if workout has real coordinates (>= 2 points), use them.
        // If not (e.g. 2s test), use the scenic loop SAMPLE_ROUTE_COORDS so it's always an authentic route!
        const rawCoords = gpsWorkout?.coordinates && gpsWorkout.coordinates.length >= 2
          ? gpsWorkout.coordinates
          : SAMPLE_ROUTE_COORDS;

        const projectedPoints = projectCoordinatesToCanvas(
          rawCoords,
          routeWidth,
          routeHeight,
          Math.round(20 * scale)
        );

        if (projectedPoints.length > 1) {
          const offsetX = (width - routeWidth) / 2;
          const offsetY = routeCenterY - routeHeight / 2;

          ctx.translate(offsetX, offsetY);

          // Strava-inspired vibrant electric orange line with soft glow
          ctx.strokeStyle = '#FC5200';
          ctx.lineWidth = Math.max(4, Math.round(14 * scale));
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = 'rgba(252, 82, 0, 0.45)';
          ctx.shadowBlur = 16 * scale;

          ctx.beginPath();
          ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
          for (let i = 1; i < projectedPoints.length; i++) {
            ctx.lineTo(projectedPoints[i].x, projectedPoints[i].y);
          }
          ctx.stroke();

          // Green start marker dot
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.arc(projectedPoints[0].x, projectedPoints[0].y, Math.max(3, 8 * scale), 0, Math.PI * 2);
          ctx.fill();

          // Orange finish marker dot with white border
          const lastPt = projectedPoints[projectedPoints.length - 1];
          ctx.fillStyle = '#FC5200';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = Math.max(2, 4 * scale);
          ctx.beginPath();
          ctx.arc(lastPt.x, lastPt.y, Math.max(3, 9 * scale), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();

        // 5. Brand Logo Wordmark (NO STRAVA - Uses PULSE or Custom or None)
        if (brandStyle !== 'NONE') {
          const brandText = brandStyle === 'CUSTOM' ? (customBrandText.trim() || 'PULSE') : 'PULSE';

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `900 ${Math.round(44 * scale)}px 'Outfit', sans-serif`;
          ctx.letterSpacing = `${Math.round(5 * scale)}px`;
          ctx.shadowColor = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur = 10 * scale;
          ctx.fillText(brandText.toUpperCase(), width / 2, height * 0.85);
          ctx.restore();
        }

        resolve();
      };
      img.src = backgroundImageUrl;
    });
  };

  // Re-render live preview whenever any setting changes
  useEffect(() => {
    if (previewCanvasRef.current) {
      drawStoryToCanvas(previewCanvasRef.current, 360, 640);
    }
  }, [selectedWorkout, backgroundImageUrl, blurAmount, dimAmount, brandStyle, customBrandText, customDistance, customPace, customDuration]);

  // Export high resolution 1080x1920 PNG
  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const exportCanvas = document.createElement('canvas');
      await drawStoryToCanvas(exportCanvas, 1080, 1920);

      const dataUrl = exportCanvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `story-pulse-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to export story canvas:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Mobile Web Share
  const handleShare = async () => {
    try {
      const exportCanvas = document.createElement('canvas');
      await drawStoryToCanvas(exportCanvas, 1080, 1920);

      exportCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'story-treino-pulse.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Meu Treino',
            text: `Treino concluído: ${customDistance} em ${customDuration}!`,
            files: [file],
          });
        } else {
          handleDownload();
        }
      }, 'image/png');
    } catch {
      handleDownload();
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-125px)] p-4 md:p-6 bg-[#0B0F17] flex flex-col items-center select-none overflow-x-hidden">
      {/* Top Bar for Story */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#161D2D] border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-black text-white">Gerador de Story</h2>
            <p className="text-xs text-slate-400">Layout elegante pós-treino com desfoque e trajeto sincronizado</p>
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FC5200] hover:bg-orange-600 text-white font-bold text-xs md:text-sm shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-transform cursor-pointer"
        >
          {exportSuccess ? <Check className="w-4 h-4 text-white" /> : <Download className="w-4 h-4" />}
          <span>{exportSuccess ? 'Baixado com Sucesso!' : 'Baixar Imagem HD'}</span>
        </button>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Story Phone Mockup Preview (Center Left) */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center">
          <div className="relative w-[280px] sm:w-[320px] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 bg-black flex items-center justify-center">
            {/* Live Canvas Preview */}
            <canvas ref={previewCanvasRef} className="w-full h-full object-cover" />

            {/* Subtle phone speaker notch indicator */}
            <div className="absolute top-2.5 w-16 h-1 bg-black/60 rounded-full pointer-events-none" />
          </div>

          <span className="text-[11px] text-slate-400 mt-3 font-medium">
            Proporção 9:16 (Instagram Stories &amp; WhatsApp Status)
          </span>
        </div>

        {/* Customization Controls (Right Column) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Workout Data Selector & Manual Adjust */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-orange-400" /> Dados do Treino no Story
              </h3>
              {availableWorkouts.length > 0 && (
                <select
                  value={selectedWorkout?.id || ''}
                  onChange={(e) => {
                    const found = availableWorkouts.find((w) => w.id === e.target.value);
                    if (found) setSelectedWorkout(found);
                  }}
                  className="bg-[#161D2D] text-xs text-slate-200 border border-slate-700 rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  {availableWorkouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} ({w.type === 'running' ? `${((w as GPSWorkout).distanceMeters / 1000).toFixed(1)}k` : `${w.calories}kcal`})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Distância</label>
                <input
                  type="text"
                  value={customDistance}
                  onChange={(e) => setCustomDistance(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#161D2D] border border-slate-700 text-xs font-mono font-bold text-white focus:border-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Ritmo</label>
                <input
                  type="text"
                  value={customPace}
                  onChange={(e) => setCustomPace(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#161D2D] border border-slate-700 text-xs font-mono font-bold text-white focus:border-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tempo</label>
                <input
                  type="text"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#161D2D] border border-slate-700 text-xs font-mono font-bold text-white focus:border-orange-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card: Select Background Photo */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-orange-400" /> Foto de Fundo
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Carregue uma foto da galeria do seu celular ou utilize um fundo esportivo.
            </p>

            <div className="flex flex-col gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 active:scale-[0.98] transition-transform cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-orange-400" />
                <span>Escolher Foto da Galeria</span>
              </button>

              <div className="grid grid-cols-3 gap-2">
                {PRESET_BACKGROUNDS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setBackgroundImageUrl(preset.url)}
                    className={`p-2 rounded-xl text-center border text-[11px] font-semibold transition-all cursor-pointer ${
                      backgroundImageUrl === preset.url
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                        : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card: Blur and Dim Filters */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-orange-400" /> Ajustes Visuais
            </h3>

            <div className="space-y-4">
              {/* Blur Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-300">Desfoque do Fundo (Blur)</span>
                  <span className="text-orange-400 font-mono">{blurAmount}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={blurAmount}
                  onChange={(e) => setBlurAmount(Number(e.target.value))}
                  className="w-full accent-[#FC5200] cursor-pointer"
                />
              </div>

              {/* Dark Overlay Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-300">Escurecimento do Fundo</span>
                  <span className="text-orange-400 font-mono">{dimAmount}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="70"
                  value={dimAmount}
                  onChange={(e) => setDimAmount(Number(e.target.value))}
                  className="w-full accent-[#FC5200] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Card: Brand Watermark (NO STRAVA) */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
              Marca d&apos;Água no Rodapé
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setBrandStyle('PULSE')}
                className={`py-2 rounded-xl text-center text-xs font-black tracking-widest border transition-all cursor-pointer ${
                  brandStyle === 'PULSE'
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                }`}
              >
                PULSE
              </button>
              <button
                onClick={() => setBrandStyle('NONE')}
                className={`py-2 rounded-xl text-center text-xs font-bold border transition-all cursor-pointer ${
                  brandStyle === 'NONE'
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                }`}
              >
                Sem Logo
              </button>
              <button
                onClick={() => setBrandStyle('CUSTOM')}
                className={`py-2 rounded-xl text-center text-xs font-bold border transition-all cursor-pointer ${
                  brandStyle === 'CUSTOM'
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                }`}
              >
                Personalizar
              </button>
            </div>

            {brandStyle === 'CUSTOM' && (
              <div className="mt-3">
                <input
                  type="text"
                  maxLength={16}
                  placeholder="Seu Nome ou Clube"
                  value={customBrandText}
                  onChange={(e) => setCustomBrandText(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#161D2D] border border-slate-700 text-xs font-bold text-white focus:border-orange-500 outline-none"
                />
              </div>
            )}
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="flex-1 flex items-center justify-center gap-2 h-13 rounded-2xl bg-[#FC5200] hover:bg-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Renderizando HD...' : 'Baixar Imagem HD (1080x1920)'}</span>
            </button>

            <button
              onClick={handleShare}
              title="Compartilhar"
              className="flex items-center justify-center w-13 h-13 rounded-2xl bg-[#161D2D] border border-slate-800 text-slate-300 hover:text-white active:scale-[0.95] transition-transform cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
