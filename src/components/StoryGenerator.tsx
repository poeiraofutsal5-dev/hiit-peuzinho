import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Share2,
  Upload,
  Image as ImageIcon,
  Sliders,
  ChevronLeft,
  Check,
  Edit3,
  Move,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Layers,
  Flame,
  Clock,
  Activity,
  MapPin,
  Eye,
  EyeOff,
  RotateCcw,
  Link,
  Unlink,
} from 'lucide-react';
import { Workout, GPSWorkout, HIITWorkout, GPSCoordinate } from '../types/workout';
import { formatDurationStory, formatPaceShort, projectCoordinatesToCanvas } from '../utils/geo';
import { getStoredWorkouts } from '../services/storage';

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

/**
 * Robust cross-browser rounded rectangle helper for canvas
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export const StoryGenerator: React.FC<StoryGeneratorProps> = ({ workout: initialWorkout, onBack }) => {
  const [availableWorkouts, setAvailableWorkouts] = useState<Workout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(initialWorkout);

  // Load workouts on mount and sync whenever initialWorkout changes
  useEffect(() => {
    const list = getStoredWorkouts();
    setAvailableWorkouts(list);
    if (initialWorkout) {
      setSelectedWorkout(initialWorkout);
    } else if (!selectedWorkout && list.length > 0) {
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

  const defaultCalories = selectedWorkout && selectedWorkout.calories > 0
    ? `${selectedWorkout.calories} kcal`
    : '0 kcal';

  // Custom editable text fields for the story
  const [customDistance, setCustomDistance] = useState<string>(defaultDist);
  const [customPace, setCustomPace] = useState<string>(defaultPace);
  const [customDuration, setCustomDuration] = useState<string>(defaultDuration);
  const [customCalories, setCustomCalories] = useState<string>(defaultCalories);

  // Toggle visible metrics
  const [showDistance, setShowDistance] = useState<boolean>(true);
  const [showPace, setShowPace] = useState<boolean>(true);
  const [showDuration, setShowDuration] = useState<boolean>(true);
  const [showCalories, setShowCalories] = useState<boolean>(false);

  // Unified Group Movement State (moves Stats + Route Wave + JPX MOTION together!)
  const [linkElementsTogether, setLinkElementsTogether] = useState<boolean>(true);

  // Stats Position & Layout States (Customizable anywhere on canvas)
  const [statsPosX, setStatsPosX] = useState<number>(50); // % from left (10 to 90)
  const [statsPosY, setStatsPosY] = useState<number>(38); // % from top (10 to 90)
  const [statsAlign, setStatsAlign] = useState<'left' | 'center' | 'right'>('center');
  const [statsLayout, setStatsLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [statsCardStyle, setStatsCardStyle] = useState<'transparent' | 'frosted' | 'solid'>('transparent');
  const [statsScale, setStatsScale] = useState<number>(1.0); // 0.75 to 1.35

  // GPS Route silhouette position & toggle
  const [showRoute, setShowRoute] = useState<boolean>(true);
  const [routePosY, setRoutePosY] = useState<number>(65); // % from top (used if unlinked)
  const [routeScale, setRouteScale] = useState<number>(1.0);

  // Dragging state on preview
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Sync when selected workout changes
  useEffect(() => {
    if (selectedWorkout) {
      const isRun = selectedWorkout.type === 'running' || selectedWorkout.type === 'cycling' || selectedWorkout.type === 'walking';
      const gps = isRun ? (selectedWorkout as GPSWorkout) : null;
      const hiit = selectedWorkout.type === 'hiit' ? (selectedWorkout as HIITWorkout) : null;

      if (gps && gps.distanceMeters > 0) {
        setCustomDistance((gps.distanceMeters / 1000).toFixed(2).replace('.', ',') + ' km');
        setCustomPace(gps.avgPaceSecondsPerKm > 0 ? formatPaceShort(gps.avgPaceSecondsPerKm) : '0:00 /km');
        setCustomDuration(formatDurationStory(gps.durationSeconds));
        setCustomCalories(`${gps.calories || 0} kcal`);
      } else if (hiit && hiit.distanceMeters && hiit.distanceMeters > 0) {
        setCustomDistance((hiit.distanceMeters / 1000).toFixed(2).replace('.', ',') + ' km');
        setCustomPace(hiit.avgPaceSecondsPerKm && hiit.avgPaceSecondsPerKm > 0 ? formatPaceShort(hiit.avgPaceSecondsPerKm) : '0:00 /km');
        setCustomDuration(formatDurationStory(hiit.durationSeconds));
        setCustomCalories(`${hiit.calories || 0} kcal`);
      } else {
        setCustomDistance('0,00 km');
        setCustomPace('0:00 /km');
        setCustomDuration(selectedWorkout.durationSeconds > 0 ? formatDurationStory(selectedWorkout.durationSeconds) : '0s');
        setCustomCalories(`${selectedWorkout.calories || 0} kcal`);
      }
    } else {
      setCustomDistance('0,00 km');
      setCustomPace('0:00 /km');
      setCustomDuration('0s');
      setCustomCalories('0 kcal');
    }
  }, [selectedWorkout]);

  // Background and appearance
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>(PRESET_BACKGROUNDS[0].url);
  const [blurAmount, setBlurAmount] = useState<number>(14); // in px
  const [dimAmount, setDimAmount] = useState<number>(35); // in %
  const [brandStyle, setBrandStyle] = useState<'JPX MOTION' | 'NONE' | 'CUSTOM'>('JPX MOTION');
  const [customBrandText, setCustomBrandText] = useState<string>('JPX MOTION');
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
   * Pointer drag handlers to freely move the statistics on the preview canvas
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    updatePositionFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updatePositionFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  const updatePositionFromPointer = (e: React.PointerEvent) => {
    if (!previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(8, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100));
    setStatsPosX(Math.round(x));
    setStatsPosY(Math.round(y));
  };

  /**
   * Helper to draw Route Silhouette or Telemetry Pulse Wave on canvas
   */
  const renderRouteGraphic = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    routeW: number,
    routeH: number,
    currentScale: number
  ) => {
    ctx.save();
    const candidateCoords = (selectedWorkout as any)?.coordinates as GPSCoordinate[] | undefined;
    const hasRealCoords = candidateCoords && Array.isArray(candidateCoords) && candidateCoords.length > 0;

    if (hasRealCoords && candidateCoords.length > 1) {
      const projectedPoints = projectCoordinatesToCanvas(
        candidateCoords,
        routeW,
        routeH,
        Math.round(18 * currentScale)
      );

      if (projectedPoints.length > 1) {
        const offsetX = centerX - routeW / 2;
        const offsetY = centerY - routeH / 2;

        ctx.translate(offsetX, offsetY);

        // Electric orange route with Strava glow
        ctx.strokeStyle = '#FC5200';
        ctx.lineWidth = Math.max(3, Math.round(12 * currentScale));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(252, 82, 0, 0.45)';
        ctx.shadowBlur = 14 * currentScale;

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
        ctx.arc(projectedPoints[0].x, projectedPoints[0].y, Math.max(3, 7 * currentScale), 0, Math.PI * 2);
        ctx.fill();

        // Orange finish marker dot with white border
        const lastPt = projectedPoints[projectedPoints.length - 1];
        ctx.fillStyle = '#FC5200';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(2, 3.5 * currentScale);
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, Math.max(3, 8 * currentScale), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (hasRealCoords && candidateCoords.length === 1) {
      ctx.translate(centerX, centerY);
      ctx.strokeStyle = 'rgba(252, 82, 0, 0.4)';
      ctx.lineWidth = 2 * currentScale;
      ctx.beginPath();
      ctx.arc(0, 0, 32 * currentScale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#FC5200';
      ctx.beginPath();
      ctx.arc(0, 0, 10 * currentScale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, 4 * currentScale, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Telemetry pulse wave (identical to user image reference)
      ctx.translate(centerX, centerY);
      ctx.strokeStyle = '#FC5200';
      ctx.lineWidth = Math.max(3, Math.round(9 * currentScale));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(252, 82, 0, 0.55)';
      ctx.shadowBlur = 14 * currentScale;

      ctx.beginPath();
      const pW = routeW * 0.75;
      ctx.moveTo(-pW / 2, 0);
      ctx.lineTo(-pW * 0.2, 0);
      ctx.lineTo(-pW * 0.08, -16 * currentScale);
      ctx.lineTo(0, 20 * currentScale);
      ctx.lineTo(pW * 0.08, -24 * currentScale);
      ctx.lineTo(pW * 0.2, 0);
      ctx.lineTo(pW / 2, 0);
      ctx.stroke();
    }
    ctx.restore();
  };

  /**
   * Helper to draw Brand Wordmark (e.g. JPX MOTION)
   */
  const renderBrandLogo = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    currentScale: number
  ) => {
    if (brandStyle === 'NONE') return;
    const brandText = brandStyle === 'CUSTOM' ? (customBrandText.trim() || 'JPX MOTION') : 'JPX MOTION';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 ${Math.round(40 * currentScale)}px 'Outfit', sans-serif`;
    ctx.letterSpacing = `${Math.round(4.5 * currentScale)}px`;
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 10 * currentScale;
    ctx.fillText(brandText.toUpperCase(), centerX, centerY);
    ctx.restore();
  };

  /**
   * High-Precision Responsive Canvas Renderer.
   * Everything is drawn proportionally with scale = width / 1080.
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

        // 3. Render Custom Statistics (Active metrics list)
        const activeMetrics: { label: string; value: string }[] = [];
        if (showDistance && customDistance) activeMetrics.push({ label: 'Distância', value: customDistance });
        if (showPace && customPace) activeMetrics.push({ label: 'Ritmo', value: customPace });
        if (showDuration && customDuration) activeMetrics.push({ label: 'Tempo', value: customDuration });
        if (showCalories && customCalories) activeMetrics.push({ label: 'Calorias', value: customCalories });

        const anchorX = (statsPosX / 100) * width;
        const anchorY = (statsPosY / 100) * height;

        const labelFontSize = Math.round(28 * scale * statsScale);
        const valueFontSize = Math.round(58 * scale * statsScale);
        const labelFont = `600 ${labelFontSize}px 'Outfit', sans-serif`;
        const valueFont = `800 ${valueFontSize}px 'Outfit', sans-serif`;

        if (linkElementsTogether) {
          // ========================================================
          // MODE 1: UNIFIED GROUP (Estatísticas + Trajeto + JPX MOTION)
          // All elements move together as one cohesive telemetry sticker!
          // ========================================================

          // Calculate heights of the 3 parts
          let metricsW = width * 0.75 * statsScale;
          let metricsH = 0;
          if (activeMetrics.length > 0) {
            if (statsLayout === 'horizontal') {
              metricsH = labelFontSize + valueFontSize + 16 * scale * statsScale;
              metricsW = Math.min(width * 0.88, activeMetrics.length * (width * 0.28 * statsScale));
            } else {
              const itemHeight = labelFontSize + valueFontSize + 12 * scale * statsScale;
              const itemGap = 20 * scale * statsScale;
              metricsH = activeMetrics.length * itemHeight + (activeMetrics.length - 1) * itemGap;
              metricsW = Math.min(width * 0.82, 380 * scale * statsScale);
            }
          }

          const includeRouteInGroup = showRoute;
          const routeW = Math.min(width * 0.65, (statsLayout === 'horizontal' ? width * 0.60 : width * 0.52) * statsScale * routeScale);
          const routeH = includeRouteInGroup ? Math.round(96 * scale * statsScale * routeScale) : 0;
          const gap1 = (metricsH > 0 && routeH > 0) ? Math.round(32 * scale * statsScale) : 0;

          const includeBrandInGroup = brandStyle !== 'NONE';
          const brandH = includeBrandInGroup ? Math.round(38 * scale * statsScale) : 0;
          const gap2 = ((metricsH > 0 || routeH > 0) && brandH > 0) ? Math.round(28 * scale * statsScale) : 0;

          const totalGroupH = metricsH + gap1 + routeH + gap2 + brandH;
          const groupTopY = anchorY - totalGroupH / 2;

          // Draw Card background enclosing the entire block if enabled
          if (statsCardStyle !== 'transparent') {
            const padX = Math.round(30 * scale * statsScale);
            const padY = Math.round(24 * scale * statsScale);
            const cardW = Math.max(metricsW, routeW + 40 * scale) + padX * 2;
            const cardH = totalGroupH + padY * 2;
            const cardX = anchorX - cardW / 2;
            const cardY = groupTopY - padY;

            ctx.save();
            ctx.fillStyle = statsCardStyle === 'solid' ? 'rgba(11, 15, 23, 0.92)' : 'rgba(15, 23, 42, 0.62)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = Math.max(1, 2 * scale);
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 16 * scale;
            drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24 * scale * statsScale);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }

          // A. Draw Metrics at top of group
          if (activeMetrics.length > 0) {
            ctx.save();
            if (statsLayout === 'horizontal') {
              const itemWidth = metricsW / activeMetrics.length;
              const startX = anchorX - metricsW / 2;
              const startY = groupTopY;

              activeMetrics.forEach((metric, idx) => {
                const colCenterX = startX + idx * itemWidth + itemWidth / 2;

                ctx.font = labelFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 6 * scale;
                ctx.fillText(metric.label, colCenterX, startY);

                ctx.font = valueFont;
                ctx.fillStyle = '#FFFFFF';
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 12 * scale;
                ctx.fillText(metric.value, colCenterX, startY + labelFontSize + 8 * scale * statsScale);

                if (idx < activeMetrics.length - 1) {
                  ctx.save();
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                  ctx.lineWidth = Math.max(1, 1.5 * scale);
                  const divX = startX + (idx + 1) * itemWidth;
                  ctx.beginPath();
                  ctx.moveTo(divX, startY + 4 * scale);
                  ctx.lineTo(divX, startY + metricsH - 4 * scale);
                  ctx.stroke();
                  ctx.restore();
                }
              });
            } else {
              const itemHeight = labelFontSize + valueFontSize + 12 * scale * statsScale;
              const itemGap = 20 * scale * statsScale;
              const startY = groupTopY;

              let textX = anchorX;
              let textAlign: CanvasTextAlign = statsAlign;
              if (statsAlign === 'left') {
                textX = Math.max(36 * scale, anchorX - (width * 0.35 * statsScale));
              } else if (statsAlign === 'right') {
                textX = Math.min(width - 36 * scale, anchorX + (width * 0.35 * statsScale));
              }

              ctx.textAlign = textAlign;
              ctx.textBaseline = 'top';

              activeMetrics.forEach((metric, idx) => {
                const curY = startY + idx * (itemHeight + itemGap);

                ctx.font = labelFont;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 6 * scale;
                ctx.fillText(metric.label, textX, curY);

                ctx.font = valueFont;
                ctx.fillStyle = '#FFFFFF';
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 12 * scale;
                ctx.fillText(metric.value, textX, curY + labelFontSize + 8 * scale * statsScale);
              });
            }
            ctx.restore();
          }

          // B. Draw Route / Waveform directly below metrics
          if (includeRouteInGroup) {
            const curRouteCenterY = groupTopY + metricsH + gap1 + routeH / 2;
            renderRouteGraphic(ctx, anchorX, curRouteCenterY, routeW, routeH, scale * statsScale);
          }

          // C. Draw Brand Logo (JPX MOTION) directly below route
          if (includeBrandInGroup) {
            const curBrandY = groupTopY + metricsH + gap1 + routeH + gap2 + brandH / 2;
            renderBrandLogo(ctx, anchorX, curBrandY, scale * statsScale);
          }
        } else {
          // ========================================================
          // MODE 2: UNLINKED ELEMENTS (Individual Positioning)
          // ========================================================

          // Draw Metrics at anchorX, anchorY
          if (activeMetrics.length > 0) {
            ctx.save();
            if (statsLayout === 'horizontal') {
              const itemWidth = Math.min(width * 0.28 * statsScale, (width * 0.88) / activeMetrics.length);
              const totalWidth = activeMetrics.length * itemWidth;
              const totalHeight = labelFontSize + valueFontSize + 24 * scale * statsScale;
              const startX = anchorX - totalWidth / 2;
              const startY = anchorY - totalHeight / 2;

              if (statsCardStyle !== 'transparent') {
                const padX = 22 * scale * statsScale;
                const padY = 16 * scale * statsScale;
                ctx.save();
                ctx.fillStyle = statsCardStyle === 'solid' ? 'rgba(11, 15, 23, 0.92)' : 'rgba(15, 23, 42, 0.62)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.lineWidth = Math.max(1, 2 * scale);
                drawRoundedRect(ctx, startX - padX, startY - padY, totalWidth + padX * 2, totalHeight + padY * 2, 20 * scale * statsScale);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
              }

              activeMetrics.forEach((metric, idx) => {
                const colCenterX = startX + idx * itemWidth + itemWidth / 2;
                ctx.font = labelFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.fillText(metric.label, colCenterX, startY);

                ctx.font = valueFont;
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(metric.value, colCenterX, startY + labelFontSize + 8 * scale * statsScale);

                if (idx < activeMetrics.length - 1) {
                  ctx.save();
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                  ctx.lineWidth = Math.max(1, 1.5 * scale);
                  const divX = startX + (idx + 1) * itemWidth;
                  ctx.beginPath();
                  ctx.moveTo(divX, startY + 4 * scale);
                  ctx.lineTo(divX, startY + totalHeight - 4 * scale);
                  ctx.stroke();
                  ctx.restore();
                }
              });
            } else {
              const itemHeight = labelFontSize + valueFontSize + 14 * scale * statsScale;
              const itemGap = 24 * scale * statsScale;
              const totalHeight = activeMetrics.length * itemHeight + (activeMetrics.length - 1) * itemGap;
              const startY = anchorY - totalHeight / 2;

              let textX = anchorX;
              let textAlign: CanvasTextAlign = statsAlign;
              if (statsAlign === 'left') {
                textX = Math.max(36 * scale, anchorX - (width * 0.35 * statsScale));
              } else if (statsAlign === 'right') {
                textX = Math.min(width - 36 * scale, anchorX + (width * 0.35 * statsScale));
              }

              if (statsCardStyle !== 'transparent') {
                const cardW = Math.min(width * 0.85, 360 * scale * statsScale);
                const cardH = totalHeight + 36 * scale * statsScale;
                const padY = 18 * scale * statsScale;
                let cardX = anchorX - cardW / 2;
                if (statsAlign === 'left') cardX = textX - 24 * scale * statsScale;
                if (statsAlign === 'right') cardX = textX - cardW + 24 * scale * statsScale;

                ctx.save();
                ctx.fillStyle = statsCardStyle === 'solid' ? 'rgba(11, 15, 23, 0.92)' : 'rgba(15, 23, 42, 0.62)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.lineWidth = Math.max(1, 2 * scale);
                drawRoundedRect(ctx, cardX, startY - padY, cardW, cardH, 22 * scale * statsScale);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
              }

              ctx.textAlign = textAlign;
              ctx.textBaseline = 'top';

              activeMetrics.forEach((metric, idx) => {
                const curY = startY + idx * (itemHeight + itemGap);
                ctx.font = labelFont;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.fillText(metric.label, textX, curY);

                ctx.font = valueFont;
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(metric.value, textX, curY + labelFontSize + 8 * scale * statsScale);
              });
            }
            ctx.restore();
          }

          // Route at routePosY
          if (showRoute) {
            const rWidth = width * 0.58 * routeScale;
            const rHeight = height * 0.20 * routeScale;
            const rCenterY = (routePosY / 100) * height;
            renderRouteGraphic(ctx, width / 2, rCenterY, rWidth, rHeight, scale * routeScale);
          }

          // Brand Logo at fixed footer
          renderBrandLogo(ctx, width / 2, height * 0.88, scale);
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
  }, [
    selectedWorkout,
    backgroundImageUrl,
    blurAmount,
    dimAmount,
    brandStyle,
    customBrandText,
    customDistance,
    customPace,
    customDuration,
    customCalories,
    showDistance,
    showPace,
    showDuration,
    showCalories,
    statsPosX,
    statsPosY,
    statsAlign,
    statsLayout,
    statsCardStyle,
    statsScale,
    showRoute,
    routePosY,
    routeScale,
    linkElementsTogether,
  ]);

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

  // Quick preset positioning handlers
  const applyPresetPosition = (posX: number, posY: number, align: 'left' | 'center' | 'right') => {
    setStatsPosX(posX);
    setStatsPosY(posY);
    setStatsAlign(align);
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
            <p className="text-xs text-slate-400">Arraste o bloco completo e personalize onde quiser no story</p>
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
          <div
            ref={previewContainerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-[280px] sm:w-[320px] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 bg-black flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing"
            title="Arraste para reposicionar tudo na imagem"
          >
            {/* Live Canvas Preview */}
            <canvas ref={previewCanvasRef} className="w-full h-full object-cover pointer-events-none" />

            {/* Draggable Indicator Overlay wrapping the whole block */}
            <div
              style={{
                left: `${statsPosX}%`,
                top: `${statsPosY}%`,
                transform: 'translate(-50%, -50%)',
                width: statsLayout === 'horizontal' ? '86%' : '76%',
                height: linkElementsTogether
                  ? (statsLayout === 'horizontal' ? '120px' : '230px')
                  : (statsLayout === 'horizontal' ? '65px' : '160px'),
              }}
              className={`absolute pointer-events-none flex flex-col items-center justify-between p-2 rounded-2xl transition-all ${
                isDragging
                  ? 'ring-2 ring-orange-500 bg-orange-500/20 shadow-xl shadow-orange-500/40 scale-105'
                  : 'border-2 border-dashed border-orange-400/50 hover:border-orange-400'
              }`}
            >
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/90 backdrop-blur-md border border-orange-500/50 text-[10px] text-orange-400 font-bold whitespace-nowrap shadow-lg">
                <Move className="w-3 h-3 text-orange-400 animate-pulse" />
                <span>{isDragging ? `X: ${statsPosX}% | Y: ${statsPosY}%` : 'Mover Bloco Completo'}</span>
              </div>

              {linkElementsTogether && (
                <div className="flex items-center gap-1 text-[9px] text-slate-300 font-semibold bg-slate-950/80 px-2 py-0.5 rounded-full border border-slate-800/80">
                  <Link className="w-2.5 h-2.5 text-orange-400" />
                  <span>Estatísticas + Trajeto + JPX MOTION</span>
                </div>
              )}
            </div>

            {/* Subtle phone speaker notch indicator */}
            <div className="absolute top-2.5 w-16 h-1 bg-black/60 rounded-full pointer-events-none" />
          </div>

          <div className="flex items-center gap-2 mt-3 text-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-orange-400 font-medium bg-orange-500/10 border border-orange-500/25 px-3 py-1 rounded-full">
              <Move className="w-3.5 h-3.5" /> Arraste para mover as estatísticas, trajeto e logo juntos!
            </span>
          </div>
        </div>

        {/* Customization Controls (Right Column) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Section: Linked Movement & Position */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-orange-500/40 shadow-lg shadow-orange-500/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-orange-400" /> Posição &amp; Movimentação
              </h3>

              <button
                onClick={() => applyPresetPosition(50, 38, 'center')}
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Restaurar posição padrão"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar
              </button>
            </div>

            {/* Link Switch Toggle */}
            <div className="mb-4 p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link className="w-4 h-4 text-orange-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">Movimentar Tudo Junto</span>
                  <span className="text-[10px] text-slate-300">
                    Estatísticas, trajeto laranja e logo JPX MOTION vinculados
                  </span>
                </div>
              </div>
              <button
                onClick={() => setLinkElementsTogether(!linkElementsTogether)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  linkElementsTogether
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {linkElementsTogether ? 'Ativado' : 'Separado'}
              </button>
            </div>

            {/* Quick 1-Tap Presets */}
            <div className="mb-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                Atalhos Rápidos de Posição
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => applyPresetPosition(26, 22, 'left')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY <= 26 && statsPosX <= 35
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ↖ Topo Esq
                </button>
                <button
                  onClick={() => applyPresetPosition(50, 22, 'center')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY <= 26 && statsPosX > 35 && statsPosX < 65
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ⬆ Topo Centro
                </button>
                <button
                  onClick={() => applyPresetPosition(74, 22, 'right')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY <= 26 && statsPosX >= 65
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ↗ Topo Dir
                </button>

                <button
                  onClick={() => applyPresetPosition(26, 48, 'left')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY > 26 && statsPosY < 70 && statsPosX <= 35
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ⬅ Meio Esq
                </button>
                <button
                  onClick={() => applyPresetPosition(50, 48, 'center')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY > 26 && statsPosY < 70 && statsPosX > 35 && statsPosX < 65
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ⏺ Centro
                </button>
                <button
                  onClick={() => applyPresetPosition(74, 48, 'right')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY > 26 && statsPosY < 70 && statsPosX >= 65
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ➡ Meio Dir
                </button>

                <button
                  onClick={() => applyPresetPosition(26, 75, 'left')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY >= 70 && statsPosX <= 35
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ↙ Rodapé Esq
                </button>
                <button
                  onClick={() => applyPresetPosition(50, 75, 'center')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY >= 70 && statsPosX > 35 && statsPosX < 65
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ⬇ Rodapé Centro
                </button>
                <button
                  onClick={() => applyPresetPosition(74, 75, 'right')}
                  className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold border transition-all cursor-pointer ${
                    statsPosY >= 70 && statsPosX >= 65
                      ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                  }`}
                >
                  ↘ Rodapé Dir
                </button>
              </div>
            </div>

            {/* Precision X & Y Sliders */}
            <div className="space-y-3 pt-1 border-t border-slate-800/80">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-300">Posição Vertical (Y)</span>
                  <span className="text-orange-400 font-mono">{statsPosY}%</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="92"
                  value={statsPosY}
                  onChange={(e) => setStatsPosY(Number(e.target.value))}
                  className="w-full accent-[#FC5200] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-300">Posição Horizontal (X)</span>
                  <span className="text-orange-400 font-mono">{statsPosX}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={statsPosX}
                  onChange={(e) => setStatsPosX(Number(e.target.value))}
                  className="w-full accent-[#FC5200] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-300">Escala Geral do Bloco</span>
                  <span className="text-orange-400 font-mono">{Math.round(statsScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.35"
                  step="0.05"
                  value={statsScale}
                  onChange={(e) => setStatsScale(Number(e.target.value))}
                  className="w-full accent-[#FC5200] cursor-pointer"
                />
              </div>
            </div>

            {/* Layout Style & Alignment */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                  Formato das Estatísticas
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setStatsLayout('vertical')}
                    className={`py-2 px-2 rounded-xl text-center text-xs font-semibold border transition-all cursor-pointer ${
                      statsLayout === 'vertical'
                        ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                        : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                    }`}
                  >
                    Vertical Empilhado
                  </button>
                  <button
                    onClick={() => setStatsLayout('horizontal')}
                    className={`py-2 px-2 rounded-xl text-center text-xs font-semibold border transition-all cursor-pointer ${
                      statsLayout === 'horizontal'
                        ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                        : 'border-slate-800 bg-[#161D2D] text-slate-300 hover:text-white'
                    }`}
                  >
                    Barra Horizontal (Strava)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Text Alignment (Vertical Mode) */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                    Alinhamento
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setStatsAlign('left')}
                      className={`flex-1 p-2 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                        statsAlign === 'left'
                          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                          : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                      }`}
                      title="Alinhar à Esquerda"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setStatsAlign('center')}
                      className={`flex-1 p-2 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                        statsAlign === 'center'
                          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                          : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                      }`}
                      title="Centralizar"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setStatsAlign('right')}
                      className={`flex-1 p-2 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                        statsAlign === 'right'
                          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                          : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                      }`}
                      title="Alinhar à Direita"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Background style */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                    Fundo do Bloco
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setStatsCardStyle('transparent')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                        statsCardStyle === 'transparent'
                          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                          : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                      }`}
                    >
                      Limpo
                    </button>
                    <button
                      onClick={() => setStatsCardStyle('frosted')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                        statsCardStyle === 'frosted'
                          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                          : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                      }`}
                    >
                      Vidro
                    </button>
                    <button
                      onClick={() => setStatsCardStyle('solid')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                        statsCardStyle === 'solid'
                          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                          : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                      }`}
                    >
                      Escuro
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Workout Data Selector & Manual Adjust */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-orange-400" /> Valores das Estatísticas
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

            {/* Metric toggles & text inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Distância</label>
                  <button
                    onClick={() => setShowDistance(!showDistance)}
                    className="text-[10px] text-slate-400 hover:text-orange-400 cursor-pointer"
                    title={showDistance ? 'Ocultar' : 'Exibir'}
                  >
                    {showDistance ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-500" />}
                  </button>
                </div>
                <input
                  type="text"
                  value={customDistance}
                  disabled={!showDistance}
                  onChange={(e) => setCustomDistance(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg bg-[#161D2D] border text-xs font-mono font-bold outline-none ${
                    showDistance ? 'border-slate-700 text-white focus:border-orange-500' : 'border-slate-800 text-slate-500 opacity-60'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Ritmo</label>
                  <button
                    onClick={() => setShowPace(!showPace)}
                    className="text-[10px] text-slate-400 hover:text-orange-400 cursor-pointer"
                    title={showPace ? 'Ocultar' : 'Exibir'}
                  >
                    {showPace ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-500" />}
                  </button>
                </div>
                <input
                  type="text"
                  value={customPace}
                  disabled={!showPace}
                  onChange={(e) => setCustomPace(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg bg-[#161D2D] border text-xs font-mono font-bold outline-none ${
                    showPace ? 'border-slate-700 text-white focus:border-orange-500' : 'border-slate-800 text-slate-500 opacity-60'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Tempo</label>
                  <button
                    onClick={() => setShowDuration(!showDuration)}
                    className="text-[10px] text-slate-400 hover:text-orange-400 cursor-pointer"
                    title={showDuration ? 'Ocultar' : 'Exibir'}
                  >
                    {showDuration ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-500" />}
                  </button>
                </div>
                <input
                  type="text"
                  value={customDuration}
                  disabled={!showDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg bg-[#161D2D] border text-xs font-mono font-bold outline-none ${
                    showDuration ? 'border-slate-700 text-white focus:border-orange-500' : 'border-slate-800 text-slate-500 opacity-60'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Calorias</label>
                  <button
                    onClick={() => setShowCalories(!showCalories)}
                    className="text-[10px] text-slate-400 hover:text-orange-400 cursor-pointer"
                    title={showCalories ? 'Ocultar' : 'Exibir'}
                  >
                    {showCalories ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-500" />}
                  </button>
                </div>
                <input
                  type="text"
                  value={customCalories}
                  disabled={!showCalories}
                  onChange={(e) => setCustomCalories(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg bg-[#161D2D] border text-xs font-mono font-bold outline-none ${
                    showCalories ? 'border-slate-700 text-white focus:border-orange-500' : 'border-slate-800 text-slate-500 opacity-60'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section: GPS Route Silhouette Settings */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-400" /> Trajeto / Linha Laranja
              </h3>
              <button
                onClick={() => setShowRoute(!showRoute)}
                className="text-xs font-semibold flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
              >
                {showRoute ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Exibindo
                  </span>
                ) : (
                  <span className="text-slate-500 flex items-center gap-1">
                    <EyeOff className="w-3.5 h-3.5" /> Oculto
                  </span>
                )}
              </button>
            </div>

            {showRoute && (
              <div className="space-y-3 mt-3">
                <div className="text-[11px] text-slate-400">
                  {linkElementsTogether ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <Link className="w-3 h-3" /> Vinculado ao bloco: movimenta-se junto com as estatísticas e logo.
                    </span>
                  ) : (
                    <span>Posicione a altura do trajeto individualmente:</span>
                  )}
                </div>

                {!linkElementsTogether && (
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-300">Posição Vertical do Trajeto</span>
                      <span className="text-orange-400 font-mono">{routePosY}%</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="80"
                      value={routePosY}
                      onChange={(e) => setRoutePosY(Number(e.target.value))}
                      className="w-full accent-[#FC5200] cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section: Select Background Photo */}
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

          {/* Section: Blur and Dim Filters */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-orange-400" /> Ajustes Visuais do Fundo
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

          {/* Section: Brand Watermark */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
              Marca d&apos;Água (Logo)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setBrandStyle('JPX MOTION')}
                className={`py-2 rounded-xl text-center text-xs font-black tracking-widest border transition-all cursor-pointer ${
                  brandStyle === 'JPX MOTION'
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-slate-800 bg-[#161D2D] text-slate-400 hover:text-white'
                }`}
              >
                JPX MOTION
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
