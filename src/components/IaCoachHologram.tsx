'use client';

import React, { useEffect, useRef } from 'react';

interface IaCoachHologramProps {
  width?: number;
  height?: number;
  isActive?: boolean;
}

export const IaCoachHologram: React.FC<IaCoachHologramProps> = ({
  width = 120,
  height = 120,
  isActive = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.min(width, height) * 0.45;

      // 1. Draw outer scanning laser circle
      ctx.save();
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI);
      ctx.stroke();

      // Outer dashed spinning ring
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.35)';
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius - 4, angle, angle + 2 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // 2. Draw breathing glowing core
      const pulse = 1.0 + 0.08 * Math.sin(Date.now() / 350);
      const coreRadius = maxRadius * 0.7 * pulse;

      ctx.save();
      const radialGlow = ctx.createRadialGradient(
        centerX, centerY, coreRadius * 0.1,
        centerX, centerY, coreRadius
      );
      radialGlow.addColorStop(0, 'rgba(163, 230, 53, 0.7)');
      radialGlow.addColorStop(0.3, 'rgba(163, 230, 53, 0.25)');
      radialGlow.addColorStop(0.7, 'rgba(34, 197, 94, 0.08)');
      radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radialGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      // 3. Draw holographic scanning sine-wave spikes (representing speech or neural patterns)
      ctx.save();
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      
      const wavePointsCount = 20;
      const step = (maxRadius * 1.3) / wavePointsCount;
      const startX = centerX - (maxRadius * 0.65);
      
      for (let i = 0; i <= wavePointsCount; i++) {
        const x = startX + i * step;
        // Distance from center factor to taper the waves at the edges
        const distFromCenter = Math.abs(x - centerX) / (maxRadius * 0.65);
        const envelope = Math.max(0, 1 - distFromCenter * distFromCenter);
        
        // Sine wave formula with time component
        const waveTime = Date.now() / 150;
        const yOffset = Math.sin(waveTime + i * 0.6) * 16 * envelope * (isActive ? 1.0 : 0.25);
        
        if (i === 0) {
          ctx.moveTo(x, centerY + yOffset);
        } else {
          ctx.lineTo(x, centerY + yOffset);
        }
      }
      ctx.stroke();
      ctx.restore();

      // 4. Floating matrix/digital rain particles
      ctx.save();
      ctx.fillStyle = 'rgba(163, 230, 53, 0.5)';
      const timeVal = Date.now() / 1000;
      for (let i = 0; i < 6; i++) {
        const particleAngle = (i * Math.PI) / 3 + timeVal * 0.4;
        const pRadius = maxRadius * 0.85;
        const px = centerX + Math.cos(particleAngle) * pRadius;
        const py = centerY + Math.sin(particleAngle) * pRadius + Math.sin(timeVal * 4 + i) * 3;
        
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();

      // 5. Vertical Scanning laser line
      ctx.save();
      const laserY = centerY + Math.sin(Date.now() / 450) * (maxRadius * 0.95);
      const laserWidth = Math.sqrt(Math.max(0, maxRadius * maxRadius - (laserY - centerY) * (laserY - centerY)));
      
      const laserGrad = ctx.createLinearGradient(centerX - laserWidth, laserY, centerX + laserWidth, laserY);
      laserGrad.addColorStop(0, 'rgba(163, 230, 53, 0)');
      laserGrad.addColorStop(0.5, 'rgba(163, 230, 53, 0.7)');
      laserGrad.addColorStop(1, 'rgba(163, 230, 53, 0)');
      
      ctx.strokeStyle = laserGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX - laserWidth, laserY);
      ctx.lineTo(centerX + laserWidth, laserY);
      ctx.stroke();
      ctx.restore();

      angle += 0.012;
      animId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [width, height, isActive]);

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width, height }}>
      {/* Decorative cyber ambient shadows */}
      <div className="absolute inset-2 bg-gym-accent/5 rounded-full blur-xl pointer-events-none animate-pulse"></div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="relative block filter drop-shadow-[0_0_10px_rgba(163,230,53,0.35)]"
      />
    </div>
  );
};
