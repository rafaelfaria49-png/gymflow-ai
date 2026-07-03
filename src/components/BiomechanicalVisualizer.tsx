'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Camera, ZoomIn, Eye, Sparkles } from 'lucide-react';

interface BiomechanicalVisualizerProps {
  exerciseId: string;
  isPlaying?: boolean;
  playbackSpeed?: number;
  width?: number;
  height?: number;
  showMetrics?: boolean;
  genderOverride?: 'male' | 'female' | 'neutral';
  initialCamera?: 'side' | 'front' | 'diagonal' | 'detail';
}

export const BiomechanicalVisualizer: React.FC<BiomechanicalVisualizerProps> = ({
  exerciseId,
  isPlaying = true,
  playbackSpeed = 1,
  width = 400,
  height = 250,
  showMetrics = true,
  genderOverride,
  initialCamera = 'diagonal'
}) => {
  const { user } = useGymFlow();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState(0);
  
  // Local state for camera angle to allow switching
  const [cameraAngle, setCameraAngle] = useState<'side' | 'front' | 'diagonal' | 'detail'>(initialCamera);

  const gender = genderOverride || user?.gender || 'neutral';

  // Animation frame loop
  useEffect(() => {
    let animFrameId: number;
    let lastTime = performance.now();

    const update = (time: number) => {
      if (isPlaying) {
        const delta = (time - lastTime) / 1000;
        // 1 complete cycle every 3 seconds at 1x speed
        const cycleSpeed = (2 * Math.PI) / 3; 
        setPhase((prev) => (prev + delta * cycleSpeed * playbackSpeed) % (2 * Math.PI));
      }
      lastTime = time;
      animFrameId = requestAnimationFrame(update);
    };

    animFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, playbackSpeed]);

  // Canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // 1. CINEMATIC GYM BACKGROUND
    // Dark linear wallpaper
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#060608');
    bgGrad.addColorStop(1, '#0e0e13');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 3D Perspective rotation projection math
    let angleRad = 0;
    let zoomFactor = 1.0;
    let centerOffsetY = 15;

    if (cameraAngle === 'front') {
      angleRad = 0;
    } else if (cameraAngle === 'side') {
      angleRad = Math.PI / 2;
    } else if (cameraAngle === 'diagonal') {
      angleRad = Math.PI / 5;
    } else if (cameraAngle === 'detail') {
      angleRad = Math.PI / 6;
      zoomFactor = 1.6; // Close-up detail camera
      centerOffsetY = -15;
    }

    const project = (x3d: number, y3d: number, z3d: number) => {
      // Rotate around Y axis
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const rx = x3d * cosA - z3d * sinA;
      const rz = x3d * sinA + z3d * cosA;

      // Perspective scale factor
      const camDist = 280;
      const scale = (camDist / (camDist + rz)) * zoomFactor;
      
      const screenX = width / 2 + rx * scale;
      const screenY = height / 2 + centerOffsetY + y3d * scale;
      return { x: screenX, y: screenY, depth: rz };
    };

    // 3D Gym Floor Shadow & Cinematic Volumetric Light Cone
    ctx.save();
    // Radial ambient backglow
    const radialGlow = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width / 1.5);
    radialGlow.addColorStop(0, gender === 'male' ? 'rgba(59, 130, 246, 0.03)' : gender === 'female' ? 'rgba(163, 230, 53, 0.03)' : 'rgba(16, 185, 129, 0.02)');
    radialGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = radialGlow;
    ctx.fillRect(0, 0, width, height);

    // 1. Soft radial floor shadow (grounds the person in 3D space)
    const shadowGrad = ctx.createRadialGradient(width / 2, height - 35, 5, width / 2, height - 35, 95);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(width / 2, height - 35, 95, 14, 0, 0, 2 * Math.PI);
    ctx.fill();

    // 2. Volumetric Spotlight Cone from above
    const spotlightGrad = ctx.createLinearGradient(width / 2, 0, width / 2, height);
    spotlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
    spotlightGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.015)');
    spotlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spotlightGrad;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 30, 0);
    ctx.lineTo(width / 2 + 30, 0);
    ctx.lineTo(width / 2 + 140, height);
    ctx.lineTo(width / 2 - 140, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw blurred background gym objects (Depth of Field mockup)
    ctx.save();
    // Blur ambient light bars
    const neonHue = gender === 'male' ? '59, 130, 246' : gender === 'female' ? '163, 230, 53' : '16, 185, 129';
    ctx.shadowBlur = 25;
    ctx.shadowColor = `rgba(${neonHue}, 0.25)`;
    ctx.fillStyle = `rgba(${neonHue}, 0.08)`;
    // Left blurry vertical light panel
    ctx.fillRect(width * 0.05, 10, width * 0.02, height - 20);
    // Right blurry vertical light panel
    ctx.fillRect(width * 0.93, 10, width * 0.02, height - 20);
    ctx.restore();

    // Determine exercise category
    const id = exerciseId.toLowerCase();
    let type: 'SQUAT' | 'LEG_PRESS' | 'PRESS' | 'TRICEPS' | 'DEADLIFT' | 'STIFF' | 'ROW' | 'PUXADA' | 'SHOULDER_PRESS' | 'THRUST' | 'CURL' | 'ABS' | 'MOBILITY' | 'DEFAULT' = 'DEFAULT';

    if (id.includes('leg_press') || id.includes('legpress')) {
      type = 'LEG_PRESS';
    } else if (id.includes('agachamento') || id.includes('squat')) {
      type = 'SQUAT';
    } else if (id.includes('supino') || id.includes('press') || id.includes('pushup')) {
      type = 'PRESS';
    } else if (id.includes('triceps')) {
      type = 'TRICEPS';
    } else if (id.includes('stiff')) {
      type = 'STIFF';
    } else if (id.includes('terra') || id.includes('deadlift')) {
      type = 'DEADLIFT';
    } else if (id.includes('remada') || id.includes('costas')) {
      type = 'ROW';
    } else if (id.includes('puxada') || id.includes('pulldown')) {
      type = 'PUXADA';
    } else if (id.includes('desenvolvimento') || id.includes('shoulder')) {
      type = 'SHOULDER_PRESS';
    } else if (id.includes('elevacao_pelvica') || id.includes('pelvica') || id.includes('hip_thrust')) {
      type = 'THRUST';
    } else if (id.includes('rosca') || id.includes('biceps') || id.includes('curl')) {
      type = 'CURL';
    } else if (id.includes('abdominal') || id.includes('crunch') || id.includes('abs')) {
      type = 'ABS';
    } else if (id.includes('mobilidade') || id.includes('alongamento') || id.includes('mobility')) {
      type = 'MOBILITY';
    }

    // Phase: 0 = start, 1 = maximum force
    const k = (1 - Math.cos(phase)) / 2;
    const isConcentric = Math.sin(phase) < 0;

    // Premium styling config based on active gender profile
    const jointRadius = 6.5;
    const skinColor = gender === 'neutral' 
      ? '#71717a' // Chrome metallic / gray skeletal base
      : gender === 'male' 
        ? '#dfa080' // Athletic tan
        : '#f3c1a3'; // Soft skin peach tone
    const clothingColor = gender === 'neutral'
      ? '#3f3f46'
      : gender === 'male'
        ? '#1e3a8a' // Royal blue athletic regata / shorts
        : '#84cc16'; // Cyber-lime crop top / leggings

    let angleLabel = '';

    // Body joint vectors in 3D relative to center (0,0,0)
    let joints3d: { [key: string]: { x: number; y: number; z: number } } = {};
    let showBar = false;
    let barLeft3d = { x: 0, y: 0, z: 0 };
    let barRight3d = { x: 0, y: 0, z: 0 };
    let showBench = false;
    let benchStart3d = { x: 0, y: 0, z: 0 };
    let benchEnd3d = { x: 0, y: 0, z: 0 };
    let showSled = false;
    let cableStart3d = { x: 0, y: 0, z: 0 };
    let cableEnd3d = { x: 0, y: 0, z: 0 };
    let showCable = false;

    // Muscle highlight list
    const activeMuscles: { name: string; x: number; y: number; z: number; size: number; isPrimary: boolean }[] = [];

    // Joint projections setup
    switch (type) {
      case 'SQUAT': {
        angleLabel = Math.round(75 + 100 * (1 - k)) + '°';
        const squatDepth = 52 * k;
        const kneeForward = 16 * k;
        const hipBack = -28 * k;

        // Ground is at Y = 75
        joints3d.ankleL = { x: -16, y: 70, z: 0 };
        joints3d.ankleR = { x: 16, y: 70, z: 0 };
        joints3d.footL = { x: -16, y: 72, z: 12 };
        joints3d.footR = { x: 16, y: 72, z: 12 };

        joints3d.kneeL = { x: -18 - 4 * k, y: 30 + 15 * k, z: kneeForward };
        joints3d.kneeR = { x: 18 + 4 * k, y: 30 + 15 * k, z: kneeForward };

        joints3d.hipL = { x: -13, y: -10 + squatDepth, z: hipBack };
        joints3d.hipR = { x: 13, y: -10 + squatDepth, z: hipBack };

        joints3d.shoulderL = { x: -18, y: -62 + squatDepth, z: hipBack + 5 * k };
        joints3d.shoulderR = { x: 18, y: -62 + squatDepth, z: hipBack + 5 * k };

        joints3d.neck = { x: 0, y: -65 + squatDepth, z: hipBack + 3 * k };
        joints3d.head = { x: 0, y: -80 + squatDepth, z: hipBack + 1 * k };

        joints3d.elbowL = { x: -22, y: -50 + squatDepth, z: hipBack - 4 * k };
        joints3d.elbowR = { x: 22, y: -50 + squatDepth, z: hipBack - 4 * k };
        joints3d.wristL = { x: -20, y: -60 + squatDepth, z: hipBack };
        joints3d.wristR = { x: 20, y: -60 + squatDepth, z: hipBack };

        barLeft3d = { x: -45, y: -62 + squatDepth, z: hipBack + 5 * k };
        barRight3d = { x: 45, y: -62 + squatDepth, z: hipBack + 5 * k };
        showBar = true;

        activeMuscles.push(
          { name: 'Quadríceps', x: -16, y: 10 + squatDepth, z: kneeForward / 2, size: 18, isPrimary: true },
          { name: 'Quadríceps R', x: 16, y: 10 + squatDepth, z: kneeForward / 2, size: 18, isPrimary: true },
          { name: 'Glúteos', x: 0, y: squatDepth, z: hipBack - 10, size: 24, isPrimary: true }
        );
        break;
      }

      case 'LEG_PRESS': {
        angleLabel = Math.round(80 + 90 * k) + '°';
        const pressSled = 40 * (1 - k);
        joints3d.hipL = { x: -13, y: 40, z: -25 };
        joints3d.hipR = { x: 13, y: 40, z: -25 };

        joints3d.shoulderL = { x: -16, y: 15, z: -55 };
        joints3d.shoulderR = { x: 16, y: 15, z: -55 };
        joints3d.neck = { x: 0, y: 10, z: -60 };
        joints3d.head = { x: 0, y: -3, z: -64 };

        joints3d.ankleL = { x: -14, y: -15 + pressSled, z: 25 - pressSled };
        joints3d.ankleR = { x: 14, y: -15 + pressSled, z: 25 - pressSled };
        joints3d.footL = { x: -14, y: -17 + pressSled, z: 32 - pressSled };
        joints3d.footR = { x: 14, y: -17 + pressSled, z: 32 - pressSled };

        joints3d.kneeL = { x: -22, y: -25 + 15 * (1 - k), z: -10 * k };
        joints3d.kneeR = { x: 22, y: -25 + 15 * (1 - k), z: -10 * k };

        joints3d.elbowL = { x: -20, y: 45, z: -35 };
        joints3d.elbowR = { x: 20, y: 45, z: -35 };
        joints3d.wristL = { x: -16, y: 40, z: -15 };
        joints3d.wristR = { x: 16, y: 40, z: -15 };

        showSled = true;

        activeMuscles.push(
          { name: 'Quadríceps L', x: -18, y: 8, z: -18, size: 16, isPrimary: true },
          { name: 'Quadríceps R', x: 18, y: 8, z: -18, size: 16, isPrimary: true },
          { name: 'Glúteos', x: 0, y: 45, z: -30, size: 20, isPrimary: false }
        );
        break;
      }

      case 'PRESS': {
        angleLabel = Math.round(70 + 100 * k) + '°';
        // Bench Press flat
        const pressStroke = 45 * k;
        joints3d.hipL = { x: -12, y: 22, z: -25 };
        joints3d.hipR = { x: 12, y: 22, z: -25 };
        joints3d.shoulderL = { x: -18, y: 22, z: 25 };
        joints3d.shoulderR = { x: 18, y: 22, z: 25 };
        joints3d.neck = { x: 0, y: 22, z: 32 };
        joints3d.head = { x: 0, y: 22, z: 45 };

        joints3d.kneeL = { x: -20, y: 42, z: -30 };
        joints3d.kneeR = { x: 20, y: 42, z: -30 };
        joints3d.ankleL = { x: -20, y: 70, z: -20 };
        joints3d.ankleR = { x: 20, y: 70, z: -20 };
        joints3d.footL = { x: -20, y: 72, z: -10 };
        joints3d.footR = { x: 20, y: 72, z: -10 };

        joints3d.wristL = { x: -22, y: -25 + pressStroke, z: 25 };
        joints3d.wristR = { x: 22, y: -25 + pressStroke, z: 25 };

        joints3d.elbowL = { x: -30 - 8 * k, y: 35 + 5 * k, z: 25 };
        joints3d.elbowR = { x: 30 + 8 * k, y: 35 + 5 * k, z: 25 };

        showBench = true;
        benchStart3d = { x: 0, y: 26, z: -40 };
        benchEnd3d = { x: 0, y: 26, z: 65 };

        barLeft3d = { x: -45, y: -25 + pressStroke, z: 25 };
        barRight3d = { x: 45, y: -25 + pressStroke, z: 25 };
        showBar = true;

        activeMuscles.push(
          { name: 'Peitoral L', x: -10, y: 15, z: 25, size: 18, isPrimary: true },
          { name: 'Peitoral R', x: 10, y: 15, z: 25, size: 18, isPrimary: true },
          { name: 'Tríceps L', x: -26, y: 28, z: 25, size: 11, isPrimary: true },
          { name: 'Tríceps R', x: 26, y: 28, z: 25, size: 11, isPrimary: true }
        );
        break;
      }

      case 'TRICEPS': {
        angleLabel = Math.round(75 + 105 * k) + '°';
        // Cable pushdown
        joints3d.ankleL = { x: -14, y: 70, z: 0 };
        joints3d.ankleR = { x: 14, y: 70, z: 0 };
        joints3d.kneeL = { x: -12, y: 40, z: 5 };
        joints3d.kneeR = { x: 12, y: 40, z: 5 };
        joints3d.hipL = { x: -12, y: 10, z: -5 };
        joints3d.hipR = { x: 12, y: 10, z: -5 };
        joints3d.shoulderL = { x: -16, y: -45, z: 5 };
        joints3d.shoulderR = { x: 16, y: -45, z: 5 };
        joints3d.neck = { x: 0, y: -50, z: 6 };
        joints3d.head = { x: 0, y: -64, z: 4 };

        joints3d.elbowL = { x: -18, y: -28, z: 12 };
        joints3d.elbowR = { x: 18, y: -28, z: 12 };

        // Hands push cable down
        const pullFactor = 42 * k;
        joints3d.wristL = { x: -16, y: -26 + pullFactor, z: 25 - 8 * k };
        joints3d.wristR = { x: 16, y: -26 + pullFactor, z: 25 - 8 * k };

        cableStart3d = { x: 0, y: -75, z: 30 };
        cableEnd3d = { x: 0, y: -26 + pullFactor, z: 25 - 8 * k };
        showCable = true;

        activeMuscles.push(
          { name: 'Tríceps L', x: -18, y: -38, z: 8, size: 11, isPrimary: true },
          { name: 'Tríceps R', x: 18, y: -38, z: 8, size: 11, isPrimary: true }
        );
        break;
      }

      case 'DEADLIFT': {
        angleLabel = Math.round(75 + 95 * (1 - k)) + '°';
        const deadDepth = 40 * k;
        joints3d.ankleL = { x: -16, y: 70, z: 0 };
        joints3d.ankleR = { x: 16, y: 70, z: 0 };
        
        joints3d.kneeL = { x: -18, y: 42 + 8 * k, z: 15 * k };
        joints3d.kneeR = { x: 18, y: 42 + 8 * k, z: 15 * k };

        joints3d.hipL = { x: -12, y: 10 + deadDepth, z: -35 * k };
        joints3d.hipR = { x: 12, y: 10 + deadDepth, z: -35 * k };

        joints3d.shoulderL = { x: -18, y: -45 + 50 * k, z: 10 - 25 * k };
        joints3d.shoulderR = { x: 18, y: -45 + 50 * k, z: 10 - 25 * k };
        joints3d.neck = { x: 0, y: -50 + 50 * k, z: 12 - 25 * k };
        joints3d.head = { x: 0, y: -64 + 50 * k, z: 15 - 25 * k };

        joints3d.wristL = { x: -18, y: 15 + deadDepth, z: 15 - 20 * k };
        joints3d.wristR = { x: 18, y: 15 + deadDepth, z: 15 - 20 * k };
        joints3d.elbowL = { x: -19, y: -15 + deadDepth, z: 15 - 20 * k };
        joints3d.elbowR = { x: 19, y: -15 + deadDepth, z: 15 - 20 * k };

        barLeft3d = { x: -45, y: 15 + deadDepth, z: 15 - 20 * k };
        barRight3d = { x: 45, y: 15 + deadDepth, z: 15 - 20 * k };
        showBar = true;

        activeMuscles.push(
          { name: 'Posterior L', x: -15, y: 25 + deadDepth, z: -10 * k, size: 14, isPrimary: true },
          { name: 'Posterior R', x: 15, y: 25 + deadDepth, z: -10 * k, size: 14, isPrimary: true },
          { name: 'Glúteos', x: 0, y: deadDepth + 15, z: -32 * k, size: 22, isPrimary: true },
          { name: 'Lombar', x: 0, y: deadDepth - 10, z: -15 * k, size: 15, isPrimary: false }
        );
        break;
      }

      case 'STIFF': {
        angleLabel = Math.round(80 + 90 * (1 - k)) + '°';
        // Hinges hips extremely back, knees stay nearly straight
        const stiffDepth = 48 * k;
        joints3d.ankleL = { x: -16, y: 70, z: 0 };
        joints3d.ankleR = { x: 16, y: 70, z: 0 };

        joints3d.kneeL = { x: -17, y: 40 + 2 * k, z: 5 * k };
        joints3d.kneeR = { x: 17, y: 40 + 2 * k, z: 5 * k };

        joints3d.hipL = { x: -12, y: 10 + 15 * k, z: -40 * k };
        joints3d.hipR = { x: 12, y: 10 + 15 * k, z: -40 * k };

        joints3d.shoulderL = { x: -18, y: -45 + stiffDepth, z: 15 - 40 * k };
        joints3d.shoulderR = { x: 18, y: -45 + stiffDepth, z: 15 - 40 * k };
        joints3d.neck = { x: 0, y: -50 + stiffDepth, z: 18 - 40 * k };
        joints3d.head = { x: 0, y: -64 + stiffDepth, z: 20 - 40 * k };

        joints3d.wristL = { x: -18, y: 10 + stiffDepth, z: 20 - 40 * k };
        joints3d.wristR = { x: 18, y: 10 + stiffDepth, z: 20 - 40 * k };
        joints3d.elbowL = { x: -19, y: -15 + stiffDepth, z: 20 - 40 * k };
        joints3d.elbowR = { x: 19, y: -15 + stiffDepth, z: 20 - 40 * k };

        barLeft3d = { x: -45, y: 10 + stiffDepth, z: 20 - 40 * k };
        barRight3d = { x: 45, y: 10 + stiffDepth, z: 20 - 40 * k };
        showBar = true;

        activeMuscles.push(
          { name: 'Posterior L', x: -14, y: 25 + 10 * k, z: -20 * k, size: 14, isPrimary: true },
          { name: 'Posterior R', x: 14, y: 25 + 10 * k, z: -20 * k, size: 14, isPrimary: true },
          { name: 'Glúteos', x: 0, y: 10 + 10 * k, z: -40 * k, size: 22, isPrimary: true }
        );
        break;
      }

      case 'ROW': {
        angleLabel = Math.round(80 + 90 * k) + '°';
        // Bent over row
        joints3d.ankleL = { x: -16, y: 70, z: 0 };
        joints3d.ankleR = { x: 16, y: 70, z: 0 };
        joints3d.kneeL = { x: -18, y: 42, z: 12 };
        joints3d.kneeR = { x: 18, y: 42, z: 12 };
        joints3d.hipL = { x: -12, y: 15, z: -20 };
        joints3d.hipR = { x: 12, y: 15, z: -20 };

        joints3d.shoulderL = { x: -18, y: -15, z: 22 };
        joints3d.shoulderR = { x: 18, y: -15, z: 22 };
        joints3d.neck = { x: 0, y: -20, z: 25 };
        joints3d.head = { x: 0, y: -34, z: 27 };

        joints3d.wristL = { x: -18, y: 35 - 30 * k, z: 20 - 15 * k };
        joints3d.wristR = { x: 18, y: 35 - 30 * k, z: 20 - 15 * k };
        
        joints3d.elbowL = { x: -22 - 12 * k, y: 10 - 24 * k, z: -5 * k };
        joints3d.elbowR = { x: 22 + 12 * k, y: 10 - 24 * k, z: -5 * k };

        barLeft3d = { x: -42, y: 35 - 30 * k, z: 20 - 15 * k };
        barRight3d = { x: 42, y: 35 - 30 * k, z: 20 - 15 * k };
        showBar = true;

        activeMuscles.push(
          { name: 'Costas L', x: -12, y: -5, z: 5, size: 16, isPrimary: true },
          { name: 'Costas R', x: 12, y: -5, z: 5, size: 16, isPrimary: true },
          { name: 'Bíceps L', x: -19, y: 20 - 25 * k, z: 10 * k, size: 9, isPrimary: false }
        );
        break;
      }

      case 'PUXADA': {
        angleLabel = Math.round(70 + 105 * k) + '°';
        // Seated lat pulldown
        joints3d.ankleL = { x: -15, y: 70, z: 10 };
        joints3d.ankleR = { x: 15, y: 70, z: 10 };
        joints3d.kneeL = { x: -15, y: 35, z: 15 };
        joints3d.kneeR = { x: 15, y: 35, z: 15 };
        joints3d.hipL = { x: -12, y: 40, z: -10 };
        joints3d.hipR = { x: 12, y: 40, z: -10 };

        joints3d.shoulderL = { x: -18, y: -12, z: -8 };
        joints3d.shoulderR = { x: 18, y: -12, z: -8 };
        joints3d.neck = { x: 0, y: -18, z: -6 };
        joints3d.head = { x: 0, y: -32, z: -6 };

        const pullDown = 48 * k;
        joints3d.wristL = { x: -20, y: -50 + pullDown, z: -3 };
        joints3d.wristR = { x: 20, y: -50 + pullDown, z: -3 };

        joints3d.elbowL = { x: -24 - 4 * k, y: -25 + 46 * k, z: -10 * k };
        joints3d.elbowR = { x: 24 + 4 * k, y: -25 + 46 * k, z: -10 * k };

        barLeft3d = { x: -45, y: -50 + pullDown, z: -3 };
        barRight3d = { x: 45, y: -50 + pullDown, z: -3 };
        showBar = true;

        cableStart3d = { x: 0, y: -70, z: -3 };
        cableEnd3d = { x: 0, y: -50 + pullDown, z: -3 };
        showCable = true;

        activeMuscles.push(
          { name: 'Costas L', x: -14, y: 15, z: -10, size: 18, isPrimary: true },
          { name: 'Costas R', x: 14, y: 15, z: -10, size: 18, isPrimary: true },
          { name: 'Bíceps L', x: -21, y: -5 + 20 * k, z: -5 * k, size: 9, isPrimary: false }
        );
        break;
      }

      case 'SHOULDER_PRESS': {
        angleLabel = Math.round(70 + 105 * k) + '°';
        joints3d.hipL = { x: -12, y: 35, z: -20 };
        joints3d.hipR = { x: 12, y: 35, z: -20 };
        joints3d.shoulderL = { x: -18, y: -18, z: -20 };
        joints3d.shoulderR = { x: 18, y: -18, z: -20 };
        joints3d.neck = { x: 0, y: -24, z: -20 };
        joints3d.head = { x: 0, y: -38, z: -20 };

        const pressStroke = 52 * k;
        joints3d.wristL = { x: -20, y: -24 - pressStroke, z: -20 };
        joints3d.wristR = { x: 20, y: -24 - pressStroke, z: -20 };
        
        joints3d.elbowL = { x: -25 + 8 * k, y: -8 - 15 * k, z: -20 };
        joints3d.elbowR = { x: 25 - 8 * k, y: -8 - 15 * k, z: -20 };

        barLeft3d = { x: -44, y: -24 - pressStroke, z: -20 };
        barRight3d = { x: 44, y: -24 - pressStroke, z: -20 };
        showBar = true;

        activeMuscles.push(
          { name: 'Deltóides L', x: -18, y: -24, z: -20, size: 13, isPrimary: true },
          { name: 'Deltóides R', x: 18, y: -24, z: -20, size: 13, isPrimary: true },
          { name: 'Tríceps L', x: -22, y: -16 - 10 * k, z: -20, size: 10, isPrimary: false }
        );
        break;
      }

      case 'THRUST': {
        angleLabel = Math.round(85 + 85 * (1 - k)) + '°';
        joints3d.shoulderL = { x: -16, y: 22, z: -20 };
        joints3d.shoulderR = { x: 16, y: 22, z: -20 };

        const thrustUp = 32 * k;
        joints3d.hipL = { x: -12, y: 40 - thrustUp, z: 10 };
        joints3d.hipR = { x: 12, y: 40 - thrustUp, z: 10 };

        joints3d.kneeL = { x: -15, y: 15, z: 40 };
        joints3d.kneeR = { x: 15, y: 15, z: 40 };
        joints3d.ankleL = { x: -15, y: 70, z: 40 };
        joints3d.ankleR = { x: 15, y: 70, z: 40 };
        joints3d.footL = { x: -15, y: 72, z: 48 };
        joints3d.footR = { x: 15, y: 72, z: 48 };

        joints3d.wristL = { x: -14, y: 32 - thrustUp, z: 10 };
        joints3d.wristR = { x: 14, y: 32 - thrustUp, z: 10 };
        joints3d.elbowL = { x: -16, y: 28, z: -5 };
        joints3d.elbowR = { x: 16, y: 28, z: -5 };

        barLeft3d = { x: -45, y: 38 - thrustUp, z: 10 };
        barRight3d = { x: 45, y: 38 - thrustUp, z: 10 };
        showBar = true;

        showBench = true;
        benchStart3d = { x: -25, y: 26, z: -35 };
        benchEnd3d = { x: 25, y: 26, z: -35 };

        activeMuscles.push(
          { name: 'Glúteos', x: 0, y: 42 - thrustUp, z: 5, size: 24, isPrimary: true },
          { name: 'Posterior L', x: -15, y: 42, z: 40, size: 12, isPrimary: false }
        );
        break;
      }

      case 'CURL': {
        angleLabel = Math.round(45 + 115 * k) + '°';
        joints3d.ankleL = { x: -14, y: 70, z: 0 };
        joints3d.ankleR = { x: 14, y: 70, z: 0 };
        joints3d.kneeL = { x: -13, y: 40, z: 5 };
        joints3d.kneeR = { x: 13, y: 40, z: 5 };
        joints3d.hipL = { x: -12, y: 8, z: -2 };
        joints3d.hipR = { x: 12, y: 8, z: -2 };
        
        joints3d.shoulderL = { x: -18, y: -45, z: 0 };
        joints3d.shoulderR = { x: 18, y: -45, z: 0 };
        joints3d.neck = { x: 0, y: -50, z: 2 };
        joints3d.head = { x: 0, y: -64, z: 2 };

        joints3d.elbowL = { x: -18, y: -20, z: 4 };
        joints3d.elbowR = { x: 18, y: -20, z: 4 };

        const curlAngle = -Math.PI / 4 + (Math.PI * 0.7) * k;
        const forearmX = 0;
        const forearmY = 22 * Math.cos(curlAngle);
        const forearmZ = 22 * Math.sin(curlAngle);

        joints3d.wristL = { x: -18, y: -20 + forearmY, z: 4 + forearmZ };
        joints3d.wristR = { x: 18, y: -20 + forearmY, z: 4 + forearmZ };

        barLeft3d = { x: -28, y: -20 + forearmY, z: 4 + forearmZ };
        barRight3d = { x: 28, y: -20 + forearmY, z: 4 + forearmZ };
        showBar = true;

        activeMuscles.push(
          { name: 'Bíceps L', x: -18, y: -30 + 5 * k, z: 4 + 5 * k, size: 10, isPrimary: true },
          { name: 'Bíceps R', x: 18, y: -30 + 5 * k, z: 4 + 5 * k, size: 10, isPrimary: true }
        );
        break;
      }

      case 'ABS': {
        angleLabel = Math.round(80 + 80 * (1 - k)) + '°';
        // Crunch lying down
        const rollBody = 25 * k;
        joints3d.hipL = { x: -12, y: 55, z: -10 };
        joints3d.hipR = { x: 12, y: 55, z: -10 };

        joints3d.ankleL = { x: -14, y: 55, z: 35 };
        joints3d.ankleR = { x: 14, y: 55, z: 35 };
        joints3d.kneeL = { x: -16, y: 25, z: 20 };
        joints3d.kneeR = { x: 16, y: 25, z: 20 };

        joints3d.shoulderL = { x: -18, y: 48 - rollBody, z: -35 + rollBody * 0.8 };
        joints3d.shoulderR = { x: 18, y: 48 - rollBody, z: -35 + rollBody * 0.8 };
        joints3d.neck = { x: 0, y: 46 - rollBody, z: -40 + rollBody * 0.8 };
        joints3d.head = { x: 0, y: 38 - rollBody, z: -48 + rollBody * 0.8 };

        // Hands behind head
        joints3d.elbowL = { x: -24, y: 32 - rollBody, z: -52 + rollBody * 0.8 };
        joints3d.elbowR = { x: 24, y: 32 - rollBody, z: -52 + rollBody * 0.8 };
        joints3d.wristL = { x: -8, y: 36 - rollBody, z: -50 + rollBody * 0.8 };
        joints3d.wristR = { x: 8, y: 36 - rollBody, z: -50 + rollBody * 0.8 };

        showBench = true;
        benchStart3d = { x: 0, y: 58, z: -60 };
        benchEnd3d = { x: 0, y: 58, z: 50 };

        activeMuscles.push(
          { name: 'Abdômen', x: 0, y: 48 - rollBody / 2, z: -20 + rollBody / 2, size: 18, isPrimary: true }
        );
        break;
      }

      case 'MOBILITY': {
        angleLabel = Math.round(90 + 35 * Math.sin(phase)) + '°';
        // Standing mobility rotations
        const rotAngle = phase;
        joints3d.ankleL = { x: -14, y: 70, z: 0 };
        joints3d.ankleR = { x: 14, y: 70, z: 0 };
        joints3d.kneeL = { x: -13, y: 40, z: 2 };
        joints3d.kneeR = { x: 13, y: 40, z: 2 };
        joints3d.hipL = { x: -12, y: 10, z: 0 };
        joints3d.hipR = { x: 12, y: 10, z: 0 };
        joints3d.shoulderL = { x: -18, y: -45, z: 0 };
        joints3d.shoulderR = { x: 18, y: -45, z: 0 };
        joints3d.neck = { x: 0, y: -50, z: 0 };
        joints3d.head = { x: 0, y: -64, z: 0 };

        joints3d.elbowL = { x: -18 + 10 * Math.sin(rotAngle), y: -25 + 5 * Math.cos(rotAngle), z: 12 * Math.cos(rotAngle) };
        joints3d.elbowR = { x: 18 - 10 * Math.sin(rotAngle), y: -25 + 5 * Math.cos(rotAngle), z: -12 * Math.cos(rotAngle) };
        joints3d.wristL = { x: -18 + 20 * Math.sin(rotAngle), y: -25 + 15 * Math.cos(rotAngle), z: 22 * Math.cos(rotAngle) };
        joints3d.wristR = { x: 18 - 20 * Math.sin(rotAngle), y: -25 + 15 * Math.cos(rotAngle), z: -22 * Math.cos(rotAngle) };
        break;
      }

      default: {
        angleLabel = Math.round(180 - 10 * k) + '°';
        // Idle breathing standing
        joints3d.ankleL = { x: -14, y: 70, z: 0 };
        joints3d.ankleR = { x: 14, y: 70, z: 0 };
        joints3d.kneeL = { x: -13, y: 40, z: 2 };
        joints3d.kneeR = { x: 13, y: 40, z: 2 };
        joints3d.hipL = { x: -12, y: 10, z: 0 };
        joints3d.hipR = { x: 12, y: 10, z: 0 };
        joints3d.shoulderL = { x: -18, y: -45, z: 0 };
        joints3d.shoulderR = { x: 18, y: -45, z: 0 };
        joints3d.neck = { x: 0, y: -50, z: 0 };
        joints3d.head = { x: 0, y: -64 - 3 * k, z: 0 }; // Chest expands

        joints3d.elbowL = { x: -20, y: -20, z: 5 };
        joints3d.elbowR = { x: 20, y: -20, z: 5 };
        joints3d.wristL = { x: -18, y: 0, z: 8 };
        joints3d.wristR = { x: 18, y: 0, z: 8 };
        break;
      }
    }

    // PROJECT ALL 3D COORDINATES TO 2D VIEWPORT
    const projected: { [key: string]: { x: number; y: number; depth: number } } = {};
    Object.keys(joints3d).forEach((key) => {
      projected[key] = project(joints3d[key].x, joints3d[key].y, joints3d[key].z);
    });

    const pBarLeft = project(barLeft3d.x, barLeft3d.y, barLeft3d.z);
    const pBarRight = project(barRight3d.x, barRight3d.y, barRight3d.z);
    const pBenchStart = project(benchStart3d.x, benchStart3d.y, benchStart3d.z);
    const pBenchEnd = project(benchEnd3d.x, benchEnd3d.y, benchEnd3d.z);
    const pCableStart = project(cableStart3d.x, cableStart3d.y, cableStart3d.z);
    const pCableEnd = project(cableEnd3d.x, cableEnd3d.y, cableEnd3d.z);

    // Helper: Draw 3D cylinder/capsule for muscles segments with realistic bulging muscle bellies
    const draw3DCapsule = (
      p1: { x: number; y: number; depth: number },
      p2: { x: number; y: number; depth: number },
      w1: number,
      w2: number,
      color: string,
      clothingOffset?: boolean
    ) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;

      const nx = -dy / len;
      const ny = dx / len;

      // Volumetric muscle belly calculation (wider in the middle, tapering at joints)
      const wMid = (w1 + w2) * 0.65;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;

      ctx.save();
      ctx.beginPath();
      // Organic curve outline
      ctx.moveTo(p1.x + nx * w1, p1.y + ny * w1);
      ctx.quadraticCurveTo(mx + nx * wMid, my + ny * wMid, p2.x + nx * w2, p2.y + ny * w2);
      ctx.lineTo(p2.x - nx * w2, p2.y - ny * w2);
      ctx.quadraticCurveTo(mx - nx * wMid, my - ny * wMid, p1.x - nx * w1, p1.y - ny * w1);
      ctx.closePath();

      // Specular shiny linear gradient shader
      const grad = ctx.createLinearGradient(p1.x - nx * wMid, p1.y - ny * wMid, p1.x + nx * wMid, p1.y + ny * wMid);
      const baseColor = clothingOffset ? clothingColor : skinColor;

      if (gender === 'neutral') {
        grad.addColorStop(0, '#3f3f46');
        grad.addColorStop(0.35, '#71717a');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
        grad.addColorStop(0.65, '#71717a');
        grad.addColorStop(1, '#1c1c24');
      } else {
        grad.addColorStop(0, baseColor);
        grad.addColorStop(0.35, baseColor);
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.28)'); // Specular glow
        grad.addColorStop(0.65, baseColor);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)'); // Shadow
      }

      ctx.fillStyle = grad;
      ctx.fill();
      
      // Fine lighting highlight edge
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    };

    // PAINTER'S ALGORITHM: DEPTH SORT SEGMENTS TO PREVENT COLLISION/OVERLAP
    const segments = [
      {
        name: 'head',
        depth: projected.head?.depth || 0,
        draw: () => {
          ctx.save();
          const hX = projected.head.x;
          const hY = projected.head.y;
          const r = jointRadius * 2.3;

          // Head shadow/glow
          ctx.beginPath();
          ctx.arc(hX, hY, r, 0, 2 * Math.PI);
          ctx.closePath();
          
          const headGrad = ctx.createRadialGradient(hX - r * 0.3, hY - r * 0.3, r * 0.15, hX, hY, r);
          if (gender === 'neutral') {
            headGrad.addColorStop(0, '#ffffff');
            headGrad.addColorStop(0.4, '#71717a');
            headGrad.addColorStop(1, '#18181b');
          } else {
            headGrad.addColorStop(0, '#ffffff');
            headGrad.addColorStop(0.35, skinColor);
            headGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
          }
          ctx.fillStyle = headGrad;
          ctx.fill();

          // Hair details for realistic person rendering
          if (gender === 'female') {
            ctx.fillStyle = '#2d1b10'; // brown hair
            // Bun / Ponytail
            ctx.beginPath();
            ctx.arc(hX - r * 0.8, hY - r * 0.3, r * 0.65, 0, 2 * Math.PI);
            ctx.fill();
            // Hair crown
            ctx.beginPath();
            ctx.arc(hX, hY, r, Math.PI * 0.9, Math.PI * 2.1);
            ctx.fill();
          } else if (gender === 'male') {
            ctx.fillStyle = '#111113'; // black hair/cap style
            ctx.beginPath();
            ctx.arc(hX, hY, r, Math.PI * 1.1, Math.PI * 1.9);
            ctx.fill();
          }
          ctx.restore();
        }
      },
      {
        name: 'neck',
        depth: (projected.head?.depth + projected.neck?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.head, projected.neck, jointRadius * 1.4, jointRadius * 1.4, skinColor)
      },
      {
        name: 'shoulders',
        depth: (projected.shoulderL?.depth + projected.shoulderR?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.shoulderL, projected.shoulderR, jointRadius * 2.1, jointRadius * 2.1, skinColor)
      },
      {
        name: 'torso',
        depth: (projected.shoulderL?.depth + projected.shoulderR?.depth + projected.hipL?.depth + projected.hipR?.depth) / 4 || 0,
        draw: () => {
          // Draw detailed muscular/curved torso polygon
          ctx.save();
          ctx.beginPath();
          
          const sL = projected.shoulderL;
          const sR = projected.shoulderR;
          const hL = projected.hipL;
          const hR = projected.hipR;
          const cX = (sL.x + sR.x) / 2;
          const cY = (sL.y + sR.y) / 2;
          
          ctx.moveTo(sL.x, sL.y);
          
          // Waist indentations
          const midL_X = sL.x * 0.45 + hL.x * 0.55;
          const midL_Y = sL.y * 0.45 + hL.y * 0.55;
          const waistInL = gender === 'female' ? -9 : -4;
          ctx.quadraticCurveTo(midL_X - waistInL, midL_Y, hL.x, hL.y);
          
          ctx.lineTo(hR.x, hR.y);
          
          const midR_X = sR.x * 0.45 + hR.x * 0.55;
          const midR_Y = sR.y * 0.45 + hR.y * 0.55;
          const waistInR = gender === 'female' ? 9 : 4;
          ctx.quadraticCurveTo(midR_X - waistInR, midR_Y, sR.x, sR.y);
          
          ctx.closePath();

          const torsoGrad = ctx.createLinearGradient(sL.x, cY, sR.x, cY);
          if (gender === 'neutral') {
            torsoGrad.addColorStop(0, '#3f3f46');
            torsoGrad.addColorStop(0.3, '#71717a');
            torsoGrad.addColorStop(0.5, '#ffffff');
            torsoGrad.addColorStop(0.7, '#71717a');
            torsoGrad.addColorStop(1, '#18181b');
          } else {
            torsoGrad.addColorStop(0, skinColor);
            torsoGrad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
            torsoGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
          }
          ctx.fillStyle = torsoGrad;
          ctx.fill();

          // Clothes (Tank top / Crop top)
          ctx.beginPath();
          if (gender === 'female') {
            ctx.moveTo(sL.x, sL.y);
            const chestMidL_X = sL.x * 0.5 + hL.x * 0.5;
            const chestMidL_Y = sL.y * 0.5 + hL.y * 0.5;
            const chestMidR_X = sR.x * 0.5 + hR.x * 0.5;
            const chestMidR_Y = sR.y * 0.5 + hR.y * 0.5;
            
            ctx.quadraticCurveTo(sL.x * 0.75 + hL.x * 0.25, chestMidL_Y, chestMidL_X, chestMidL_Y);
            ctx.lineTo(chestMidR_X, chestMidR_Y);
            ctx.quadraticCurveTo(sR.x * 0.75 + hR.x * 0.25, chestMidR_Y, sR.x, sR.y);
            ctx.closePath();
            
            const clothesGrad = ctx.createLinearGradient(sL.x, sL.y, sR.x, sR.y);
            clothesGrad.addColorStop(0, clothingColor);
            clothesGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
            clothesGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
            ctx.fillStyle = clothesGrad;
            ctx.fill();

            // Neckline cut
            ctx.beginPath();
            ctx.moveTo(sL.x + 5, sL.y);
            ctx.quadraticCurveTo(cX, cY + 6, sR.x - 5, sR.y);
            ctx.lineTo(sR.x, sR.y);
            ctx.lineTo(sL.x, sL.y);
            ctx.closePath();
            ctx.fillStyle = skinColor;
            ctx.fill();
          } else if (gender === 'male') {
            ctx.moveTo(sL.x + 4, sL.y + 4);
            ctx.lineTo(sR.x - 4, sR.y + 4);
            ctx.lineTo(hR.x - 1, hR.y);
            ctx.lineTo(hL.x + 1, hL.y);
            ctx.closePath();
            
            const clothesGrad = ctx.createLinearGradient(sL.x, sL.y, sR.x, sR.y);
            clothesGrad.addColorStop(0, clothingColor);
            clothesGrad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
            clothesGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
            ctx.fillStyle = clothesGrad;
            ctx.fill();

            // Neckline cut
            ctx.beginPath();
            ctx.moveTo(sL.x + 10, sL.y + 4);
            ctx.quadraticCurveTo(cX, cY + 12, sR.x - 10, sR.y + 4);
            ctx.lineTo(cX, sL.y);
            ctx.closePath();
            ctx.fillStyle = skinColor;
            ctx.fill();
          }
          ctx.restore();
        }
      },
      {
        name: 'arm_upper_L',
        depth: (projected.shoulderL?.depth + projected.elbowL?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.shoulderL, projected.elbowL, jointRadius * 1.6, jointRadius * 1.3, skinColor)
      },
      {
        name: 'arm_upper_R',
        depth: (projected.shoulderR?.depth + projected.elbowR?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.shoulderR, projected.elbowR, jointRadius * 1.6, jointRadius * 1.3, skinColor)
      },
      {
        name: 'arm_lower_L',
        depth: (projected.elbowL?.depth + projected.wristL?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.elbowL, projected.wristL, jointRadius * 1.3, jointRadius * 1.0, skinColor)
      },
      {
        name: 'arm_lower_R',
        depth: (projected.elbowR?.depth + projected.wristR?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.elbowR, projected.wristR, jointRadius * 1.3, jointRadius * 1.0, skinColor)
      },
      {
        name: 'thigh_L',
        depth: (projected.hipL?.depth + projected.kneeL?.depth) / 2 || 0,
        draw: () => {
          if (gender === 'male') {
            const leftMidThigh = {
              x: (projected.hipL.x * 0.45 + projected.kneeL.x * 0.55),
              y: (projected.hipL.y * 0.45 + projected.kneeL.y * 0.55),
              depth: (projected.hipL.depth * 0.45 + projected.kneeL.depth * 0.55)
            };
            draw3DCapsule(projected.hipL, leftMidThigh, jointRadius * 2.3, jointRadius * 2.1, skinColor, true);
            draw3DCapsule(leftMidThigh, projected.kneeL, jointRadius * 2.1, jointRadius * 1.7, skinColor, false);
          } else {
            draw3DCapsule(projected.hipL, projected.kneeL, jointRadius * 2.3, jointRadius * 1.7, skinColor, true);
          }
        }
      },
      {
        name: 'thigh_R',
        depth: (projected.hipR?.depth + projected.kneeR?.depth) / 2 || 0,
        draw: () => {
          if (gender === 'male') {
            const rightMidThigh = {
              x: (projected.hipR.x * 0.45 + projected.kneeR.x * 0.55),
              y: (projected.hipR.y * 0.45 + projected.kneeR.y * 0.55),
              depth: (projected.hipR.depth * 0.45 + projected.kneeR.depth * 0.55)
            };
            draw3DCapsule(projected.hipR, rightMidThigh, jointRadius * 2.3, jointRadius * 2.1, skinColor, true);
            draw3DCapsule(rightMidThigh, projected.kneeR, jointRadius * 2.1, jointRadius * 1.7, skinColor, false);
          } else {
            draw3DCapsule(projected.hipR, projected.kneeR, jointRadius * 2.3, jointRadius * 1.7, skinColor, true);
          }
        }
      },
      {
        name: 'calf_L',
        depth: (projected.kneeL?.depth + projected.ankleL?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.kneeL, projected.ankleL, jointRadius * 1.7, jointRadius * 1.1, skinColor, gender === 'female')
      },
      {
        name: 'calf_R',
        depth: (projected.kneeR?.depth + projected.ankleR?.depth) / 2 || 0,
        draw: () => draw3DCapsule(projected.kneeR, projected.ankleR, jointRadius * 1.7, jointRadius * 1.1, skinColor, gender === 'female')
      },
      {
        name: 'pelvis_shorts',
        depth: (projected.hipL?.depth + projected.hipR?.depth) / 2 || 0,
        draw: () => {
          if (gender === 'male') {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(projected.hipL.x - 3, projected.hipL.y - 3);
            ctx.lineTo(projected.hipR.x + 3, projected.hipR.y - 3);
            
            const leftMidThigh = {
              x: (projected.hipL.x * 0.5 + projected.kneeL.x * 0.5),
              y: (projected.hipL.y * 0.5 + projected.kneeL.y * 0.5)
            };
            const rightMidThigh = {
              x: (projected.hipR.x * 0.5 + projected.kneeR.x * 0.5),
              y: (projected.hipR.y * 0.5 + projected.kneeR.y * 0.5)
            };
            ctx.lineTo(rightMidThigh.x + 3, rightMidThigh.y);
            ctx.lineTo(leftMidThigh.x - 3, leftMidThigh.y);
            ctx.closePath();

            const shortsGrad = ctx.createLinearGradient(projected.hipL.x, projected.hipL.y, projected.hipR.x, projected.hipR.y);
            shortsGrad.addColorStop(0, clothingColor);
            shortsGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
            shortsGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
            ctx.fillStyle = shortsGrad;
            ctx.fill();
            ctx.restore();
          } else if (gender === 'female') {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(projected.hipL.x - 2, projected.hipL.y - 3);
            ctx.lineTo(projected.hipR.x + 2, projected.hipR.y - 3);
            ctx.lineTo(projected.hipR.x + 1, projected.hipR.y + 5);
            ctx.lineTo(projected.hipL.x - 1, projected.hipL.y + 5);
            ctx.closePath();
            ctx.fillStyle = '#18181b'; // Leggings waistband contrast
            ctx.fill();
            ctx.restore();
          }
        }
      },
      {
        name: 'foot_L',
        depth: projected.footL?.depth || 0,
        draw: () => {
          if (!projected.ankleL || !projected.footL) return;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(projected.ankleL.x - 4, projected.ankleL.y);
          ctx.lineTo(projected.footL.x - 3, projected.footL.y);
          ctx.lineTo(projected.footL.x + 8, projected.footL.y + 2); // Sneaker toe
          ctx.lineTo(projected.footL.x + 3, projected.footL.y - 4);
          ctx.lineTo(projected.ankleL.x + 4, projected.ankleL.y);
          ctx.closePath();
          
          const shoeGrad = ctx.createLinearGradient(projected.ankleL.x, projected.ankleL.y, projected.footL.x, projected.footL.y);
          shoeGrad.addColorStop(0, '#f4f4f5');
          shoeGrad.addColorStop(0.7, '#d4d4d8');
          shoeGrad.addColorStop(1, '#71717a');
          ctx.fillStyle = shoeGrad;
          ctx.fill();
          
          // White sole
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(projected.footL.x - 3, projected.footL.y + 1);
          ctx.lineTo(projected.footL.x + 8, projected.footL.y + 3);
          ctx.stroke();
          ctx.restore();
        }
      },
      {
        name: 'foot_R',
        depth: projected.footR?.depth || 0,
        draw: () => {
          if (!projected.ankleR || !projected.footR) return;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(projected.ankleR.x - 4, projected.ankleR.y);
          ctx.lineTo(projected.footR.x - 3, projected.footR.y);
          ctx.lineTo(projected.footR.x + 8, projected.footR.y + 2);
          ctx.lineTo(projected.footR.x + 3, projected.footR.y - 4);
          ctx.lineTo(projected.ankleR.x + 4, projected.ankleR.y);
          ctx.closePath();
          
          const shoeGrad = ctx.createLinearGradient(projected.ankleR.x, projected.ankleR.y, projected.footR.x, projected.footR.y);
          shoeGrad.addColorStop(0, '#f4f4f5');
          shoeGrad.addColorStop(0.7, '#d4d4d8');
          shoeGrad.addColorStop(1, '#71717a');
          ctx.fillStyle = shoeGrad;
          ctx.fill();
          
          // White sole
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(projected.footR.x - 3, projected.footR.y + 1);
          ctx.lineTo(projected.footR.x + 8, projected.footR.y + 3);
          ctx.stroke();
          ctx.restore();
        }
      }
    ];

    // Sort segments from back (highest depth) to front (lowest depth)
    segments.sort((a, b) => b.depth - a.depth);

    // RENDER BENCH BEHIND FOREGROUND
    if (showBench) {
      ctx.save();
      ctx.strokeStyle = '#1c1c24';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pBenchStart.x, pBenchStart.y);
      ctx.lineTo(pBenchEnd.x, pBenchEnd.y);
      ctx.stroke();

      // Bench support legs
      ctx.strokeStyle = '#0d0d12';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(pBenchStart.x, pBenchStart.y);
      ctx.lineTo(pBenchStart.x, pBenchStart.y + 35);
      ctx.moveTo(pBenchEnd.x, pBenchEnd.y);
      ctx.lineTo(pBenchEnd.x, pBenchEnd.y + 35);
      ctx.stroke();
      ctx.restore();
    }

    // DRAW HUMAN MANNEQUIN
    segments.forEach((seg) => {
      try {
        seg.draw();
      } catch (err) {
        // safety boundary
      }
    });

    // DRAW ORGANIC MUSCLE HIGHLIGHT GLOWS (Radial glowing pulses)
    activeMuscles.forEach((muscle) => {
      const pMuscle = project(muscle.x, muscle.y, muscle.z);
      const pulseScale = muscle.isPrimary ? (0.45 + 0.55 * k) : (0.2 + 0.3 * (1 - k));
      const glowRad = muscle.size * pulseScale * zoomFactor;
      
      const glowGrad = ctx.createRadialGradient(pMuscle.x, pMuscle.y, glowRad * 0.1, pMuscle.x, pMuscle.y, glowRad);
      const baseAlpha = muscle.isPrimary ? '163, 230, 53' : '239, 68, 68';
      glowGrad.addColorStop(0, `rgba(${baseAlpha}, 0.8)`);
      glowGrad.addColorStop(0.3, `rgba(${baseAlpha}, 0.35)`);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.save();
      ctx.beginPath();
      ctx.arc(pMuscle.x, pMuscle.y, glowRad, 0, 2 * Math.PI);
      ctx.fillStyle = glowGrad;
      ctx.fill();
      ctx.restore();
    });

    // DRAW CABLE WIRE
    if (showCable) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pCableStart.x, pCableStart.y);
      ctx.lineTo(pCableEnd.x, pCableEnd.y);
      ctx.stroke();
      ctx.restore();
    }

    // DRAW LEG PRESS SLED
    if (showSled) {
      ctx.save();
      const pSled1 = project(-28, -15 + 40 * (1 - k), 25 - 40 * (1 - k));
      const pSled2 = project(28, -15 + 40 * (1 - k), 25 - 40 * (1 - k));
      
      ctx.strokeStyle = '#272730';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(pSled1.x, pSled1.y);
      ctx.lineTo(pSled2.x, pSled2.y);
      ctx.stroke();

      // weight stacks
      ctx.fillStyle = '#525260';
      ctx.fillRect(pSled1.x - 4, pSled1.y - 12, 12, 24);
      ctx.fillRect(pSled2.x - 8, pSled2.y - 12, 12, 24);
      ctx.restore();
    }

    // DRAW BARBELL WITH CHROME SPECULAR GLOW
    if (showBar) {
      ctx.save();
      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(pBarLeft.x, pBarLeft.y);
      ctx.lineTo(pBarRight.x, pBarRight.y);
      ctx.stroke();

      // Weight plates
      const drawPlates = (p: { x: number; y: number }) => {
        ctx.fillStyle = '#272730';
        ctx.strokeStyle = '#3f3f46';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.rect(p.x - 4 - i * 8, p.y - 18, 6, 36);
          ctx.fill();
          ctx.stroke();
        }
      };
      drawPlates(pBarLeft);
      drawPlates(pBarRight);
      ctx.restore();
    }

  }, [phase, exerciseId, gender, width, height, showMetrics, cameraAngle]);

  return (
    <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl group w-full h-full">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full block bg-gym-dark transition-all duration-300"
      />

      {/* FLOATING CAMERA CONTROL OVERLAY */}
      <div className="absolute top-3 left-3 flex gap-1.5 opacity-70 md:opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 select-none z-20">
        {(['diagonal', 'side', 'front', 'detail'] as const).map((cam) => (
          <button
            key={cam}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCameraAngle(cam);
            }}
            className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
              cameraAngle === cam
                ? 'bg-gym-accent text-gym-dark font-black'
                : 'text-gym-text-muted hover:text-white hover:bg-white/5'
            }`}
            title={`Câmera ${cam === 'diagonal' ? 'Cinemática' : cam === 'side' ? 'Lateral' : cam === 'front' ? 'Frontal' : 'Detalhe'}`}
          >
            {cam === 'detail' ? <ZoomIn className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            <span className="text-[8px] font-bold capitalize ml-1 hidden sm:inline">
              {cam === 'diagonal' ? 'Cinemática' : cam === 'side' ? 'Lateral' : cam === 'front' ? 'Frontal' : 'Zoom'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
