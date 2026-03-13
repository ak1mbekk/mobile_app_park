import React, { useRef, useEffect, useCallback } from 'react';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

type State = 'idle' | 'dragging' | 'crumpling' | 'hoisting' | 'smoothing';

export default function PullToRefresh({
  children,
  onRefresh = () => window.location.reload(),
  disabled = false,
  className = '',
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clothPathRef = useRef<SVGPathElement>(null);
  const wrinklesPathRef = useRef<SVGPathElement>(null);
  const monkeyArmRef = useRef<HTMLDivElement>(null);
  const dragAreaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const startY = useRef(0);
  const state = useRef<State>('idle');

  const current = useRef({ y: 0, dip: 0, crumple: 0, pawY: -600 });
  const target = useRef({ y: 0, dip: 0, crumple: 0, pawY: -600 });

  const handleStart = useCallback(
    (clientY: number) => {
      if (disabled) return;
      const s = state.current;
      if (s !== 'idle' && s !== 'smoothing') return;
      const el = containerRef.current;
      if (!el || el.scrollTop > 0) return;
      isDragging.current = true;
      state.current = 'dragging';
      startY.current = clientY;
      monkeyArmRef.current?.classList.add('is-active');
    },
    [disabled]
  );

  const handleMove = useCallback(
    (clientY: number) => {
      if (!isDragging.current || state.current !== 'dragging') return;
      const dragDist = clientY - startY.current;
      if (dragDist > 0) {
        target.current.y = dragDist * 0.15;
        target.current.dip = dragDist * 0.45;
        target.current.pawY = target.current.y + target.current.dip - 370;
      }
    },
    []
  );

  const handleEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const cur = current.current;
    const tgt = target.current;
    const appFrame = frameRef.current;

    if (cur.dip > 55) {
      state.current = 'crumpling';
      tgt.crumple = 1;
      appFrame?.classList.add('is-grabbing');

      Promise.resolve(onRefresh()).catch(() => {});

      setTimeout(() => {
        state.current = 'hoisting';
        tgt.y = 0;
        tgt.dip = 0;
        tgt.pawY = -600;

        setTimeout(() => {
          state.current = 'smoothing';
          tgt.crumple = 0;
          appFrame?.classList.remove('is-grabbing');

          setTimeout(() => {
            state.current = 'idle';
            monkeyArmRef.current?.classList.remove('is-active');
          }, 300);
        }, 800);
      }, 450);
    } else {
      state.current = 'smoothing';
      tgt.y = 0;
      tgt.dip = 0;
      tgt.crumple = 0;
      tgt.pawY = -600;
      setTimeout(() => {
        state.current = 'idle';
        monkeyArmRef.current?.classList.remove('is-active');
      }, 300);
    }
  }, [onRefresh]);

  useEffect(() => {
    const clothPath = clothPathRef.current;
    const wrinklesPath = wrinklesPathRef.current;
    const monkeyArm = monkeyArmRef.current;
    const dragArea = dragAreaRef.current;
    if (!clothPath || !wrinklesPath || !monkeyArm || !dragArea) return;

    let cancelled = false;
    function renderLoop() {
      if (cancelled) return;
      const s = state.current;
      let speed = 0.15;
      if (s === 'crumpling') speed = 0.08;
      if (s === 'hoisting') speed = 0.05;
      if (s === 'smoothing') speed = 0.15;

      const cur = current.current;
      const tgt = target.current;

      cur.y += (tgt.y - cur.y) * speed;
      cur.dip += (tgt.dip - cur.dip) * speed;
      cur.crumple += (tgt.crumple - cur.crumple) * speed;
      cur.pawY += (tgt.pawY - cur.pawY) * speed;

      const cy = cur.dip - 20 * cur.crumple;
      const outBase = 120 + 50 * cur.crumple;
      const inBase = 160 + 30 * cur.crumple;
      const yTension = cur.dip * 0.2 - cur.dip * 0.4 * cur.crumple;

      const clothD = `M 0,0 
        C ${outBase},${yTension} ${inBase},${cy} 190,${cy} 
        C ${380 - inBase},${cy} ${380 - outBase},${yTension} 380,0 
        L 380,200 L 0,200 Z`;
      clothPath.setAttribute('d', clothD);

      const cx = 190;
      const wLen = 70 * cur.crumple;
      const wrinklesD = `
        M ${cx},${cy} Q ${cx - 20},${cy - wLen * 0.4} ${cx - 40},${cy - wLen * 0.8}
        M ${cx},${cy} Q ${cx - 10},${cy - wLen * 0.5} ${cx - 15},${cy - wLen * 1.1}
        M ${cx},${cy} L ${cx},${cy - wLen * 1.2}
        M ${cx},${cy} Q ${cx + 10},${cy - wLen * 0.5} ${cx + 15},${cy - wLen * 1.1}
        M ${cx},${cy} Q ${cx + 20},${cy - wLen * 0.4} ${cx + 40},${cy - wLen * 0.8}
      `;
      wrinklesPath.setAttribute('d', wrinklesD);
      wrinklesPath.style.opacity = String(cur.crumple);

      dragArea.style.transform = `translateY(${cur.y}px)`;
      monkeyArm.style.transform = `translateX(-50%) translateY(${cur.pawY}px)`;

      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const onMouseUp = () => handleEnd();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleMove, handleEnd]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => {
      if (isDragging.current && el.scrollTop <= 0 && e.touches[0].clientY - startY.current > 0) {
        e.preventDefault();
      }
    };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientY);
  const onTouchEnd = () => handleEnd();
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientY);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto overscroll-contain h-full ${className}`}
      style={{ touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      <div
        ref={frameRef}
        className="phone-frame relative w-full min-h-full overflow-hidden"
        style={{ background: 'var(--bg)' }}
      >
        <div
          className="absolute top-0 left-0 w-full z-[2] pointer-events-none overflow-hidden"
          style={{ height: 400, borderTopLeftRadius: 30, borderTopRightRadius: 30 }}
        >
          <div
            ref={monkeyArmRef}
            className="paw-container absolute top-0 left-1/2 opacity-0 transition-opacity duration-200"
            style={{
              transform: 'translateX(-50%) translateY(-600px)',
              width: 140,
              height: 500,
              willChange: 'transform',
            }}
          >
            <svg viewBox="0 0 200 500" width="100%" height="100%">
              <path
                d="M 60,-100 L 60,370 C 60,400 140,400 140,370 L 140,-100 Z"
                fill="#4A2E1B"
              />
              <path
                d="M 115,-100 L 115,370 C 115,390 140,390 140,370 L 140,-100 Z"
                fill="#372111"
              />
              <ellipse cx="100" cy="370" rx="42" ry="38" fill="#F0AA7D" />
              <g
                className="fingers-open"
                style={{
                  transition: 'opacity 0.1s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  transformOrigin: '100px 380px',
                }}
              >
                <path d="M 68,365 L 35,385" stroke="#F0AA7D" strokeWidth="20" strokeLinecap="round" fill="none" />
                <path d="M 75,390 L 60,440" stroke="#F0AA7D" strokeWidth="20" strokeLinecap="round" fill="none" />
                <path d="M 100,395 L 100,455" stroke="#F0AA7D" strokeWidth="22" strokeLinecap="round" fill="none" />
                <path d="M 125,390 L 140,440" stroke="#F0AA7D" strokeWidth="20" strokeLinecap="round" fill="none" />
                <path d="M 132,365 L 165,385" stroke="#F0AA7D" strokeWidth="20" strokeLinecap="round" fill="none" />
              </g>
              <g
                className="fingers-closed"
                style={{ opacity: 0, transition: 'opacity 0.1s ease', transformOrigin: '100px 380px' }}
              >
                <path d="M 60,380 C 60,410 140,410 140,380" fill="#D99366" />
                <path d="M 70,385 C 70,410 85,410 85,385" stroke="#4A2E1B" strokeWidth="12" strokeLinecap="round" fill="none" />
                <path d="M 90,390 C 90,420 110,420 110,390" stroke="#4A2E1B" strokeWidth="14" strokeLinecap="round" fill="none" />
                <path d="M 115,385 C 115,410 130,410 130,385" stroke="#4A2E1B" strokeWidth="12" strokeLinecap="round" fill="none" />
                <path d="M 50,370 C 80,355 120,385 110,400" stroke="#F0AA7D" strokeWidth="18" strokeLinecap="round" fill="none" />
              </g>
            </svg>
          </div>
        </div>

        <style>{`
          .paw-container.is-active { opacity: 1; }
          .phone-frame.is-grabbing .fingers-open { opacity: 0; transform: scaleY(0.5); }
          .phone-frame.is-grabbing .fingers-closed { opacity: 1; }
        `}</style>

        <div
          ref={dragAreaRef}
          className="absolute top-0 left-0 w-full h-full z-[1] cursor-grab active:cursor-grabbing pointer-events-none"
          style={{ willChange: 'transform' }}
        >
          <svg
            className="absolute top-0 left-0 overflow-visible pointer-events-none"
            viewBox="0 -120 380 320"
            preserveAspectRatio="none"
            style={{ width: '100%', height: 300 }}
          >
            <path
              ref={clothPathRef}
              className="bg-cloth"
              d="M 0,0 C 100,0 280,0 380,0 L 380,200 L 0,200 Z"
              style={{ fill: 'var(--bg-card)' }}
            />
            <path
              ref={wrinklesPathRef}
              className="wrinkles"
              d=""
              style={{
                stroke: 'rgba(0, 0, 0, 0.08)',
                strokeWidth: 3,
                strokeLinecap: 'round',
                fill: 'none',
                transition: 'opacity 0.1s ease',
              }}
            />
          </svg>
          <div
            className="absolute left-0 right-0 w-full px-5 pb-8 pt-4 pointer-events-auto"
            style={{
              top: 80,
              minHeight: 'calc(100% - 80px)',
              background: 'var(--bg-card)',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
