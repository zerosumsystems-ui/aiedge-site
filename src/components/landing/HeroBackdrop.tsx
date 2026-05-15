"use client"

/**
 * HeroBackdrop — the cinematic 3D atmosphere that lives behind the
 * hero setup reel.
 *
 * Three layered ideas, no WebGL:
 *
 *   1. Perspective grid floor — a CSS-3D rotated grid that falls toward
 *      a vanishing point on the right side of the hero. Reads as a
 *      "Tron / Westworld blueprint" surface the chart is standing on.
 *
 *   2. Drifting data particles — a handful of teal dots at varied
 *      depths, drifting horizontally with parallax. The deepest layer
 *      moves slowest; the foreground moves fastest. Cheap parallax via
 *      different animation-duration values.
 *
 *   3. Vertical scan beam — a thin vertical gradient line that sweeps
 *      across the section every 14s. The "machine is watching" element
 *      from the Westworld intro vocabulary.
 *
 * All pure CSS — no Three.js, no runtime JS. Respects
 * prefers-reduced-motion: animations freeze, the geometry still renders.
 */
export function HeroBackdrop() {
  return (
    <div
      aria-hidden
      className="hero-backdrop pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Vignette — darkens the corners, lifts the chart by contrast. */}
      <div className="hero-vignette absolute inset-0" />

      {/* Horizon glow — a soft teal lift along the bottom edge that
          gives the grid floor a "fade-to-distance" feel. */}
      <div className="hero-horizon absolute inset-x-0 bottom-0 h-2/3" />

      {/* The perspective grid floor itself. The wrapper sets the
          perspective; the inner element is the rotated plane. */}
      <div className="hero-grid-wrapper absolute inset-x-0 bottom-0 h-[60%]">
        <div className="hero-grid" />
      </div>

      {/* Drifting particles — three depth tiers. */}
      <div className="hero-particles absolute inset-0">
        <span className="hero-particle p1" />
        <span className="hero-particle p2" />
        <span className="hero-particle p3" />
        <span className="hero-particle p4" />
        <span className="hero-particle p5" />
        <span className="hero-particle p6" />
        <span className="hero-particle p7" />
        <span className="hero-particle p8" />
      </div>

      {/* Vertical scan beam */}
      <div className="hero-scan absolute inset-y-0" />

      {/* Subtle film grain to break up gradient banding */}
      <div className="hero-grain absolute inset-0" />

      <style jsx>{`
        .hero-backdrop {
          background:
            radial-gradient(
              ellipse 80% 60% at 50% 0%,
              rgba(0, 200, 150, 0.06) 0%,
              transparent 60%
            ),
            linear-gradient(180deg, #0d0d0d 0%, #141414 100%);
        }

        .hero-vignette {
          background: radial-gradient(
            ellipse 100% 80% at 50% 50%,
            transparent 0%,
            transparent 50%,
            rgba(0, 0, 0, 0.55) 100%
          );
        }

        .hero-horizon {
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 200, 150, 0.04) 60%,
            rgba(0, 200, 150, 0.10) 95%,
            rgba(0, 200, 150, 0.14) 100%
          );
          mix-blend-mode: screen;
        }

        .hero-grid-wrapper {
          perspective: 900px;
          perspective-origin: 50% 0%;
        }

        .hero-grid {
          position: absolute;
          inset: -50% -25% -25% -25%;
          background-image:
            linear-gradient(
              to right,
              rgba(0, 200, 150, 0.18) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(0, 200, 150, 0.18) 1px,
              transparent 1px
            );
          background-size: 64px 64px;
          transform: rotateX(62deg) translateZ(0);
          transform-origin: 50% 100%;
          mask-image: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 0, 0, 0.65) 35%,
            rgba(0, 0, 0, 0.95) 75%,
            #000 100%
          );
          -webkit-mask-image: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 0, 0, 0.65) 35%,
            rgba(0, 0, 0, 0.95) 75%,
            #000 100%
          );
          animation: gridDrift 32s linear infinite;
        }

        @keyframes gridDrift {
          from { background-position: 0 0, 0 0; }
          to   { background-position: 0 64px, 0 64px; }
        }

        .hero-particle {
          position: absolute;
          display: block;
          border-radius: 9999px;
          background: rgba(0, 200, 150, 0.85);
          box-shadow: 0 0 8px rgba(0, 200, 150, 0.55);
          will-change: transform, opacity;
        }
        .hero-particle.p1 { top: 22%; left: -2%; width: 3px; height: 3px; animation: drift 22s linear infinite, twinkle 4.1s ease-in-out infinite; }
        .hero-particle.p2 { top: 38%; left: -2%; width: 2px; height: 2px; opacity: 0.55; animation: drift 34s linear infinite -8s, twinkle 5.3s ease-in-out infinite -1s; }
        .hero-particle.p3 { top: 14%; left: -2%; width: 4px; height: 4px; animation: drift 18s linear infinite -4s, twinkle 3.7s ease-in-out infinite -2s; }
        .hero-particle.p4 { top: 56%; left: -2%; width: 2px; height: 2px; opacity: 0.45; animation: drift 40s linear infinite -12s, twinkle 6.1s ease-in-out infinite; }
        .hero-particle.p5 { top: 8%;  left: -2%; width: 3px; height: 3px; opacity: 0.7; animation: drift 26s linear infinite -16s, twinkle 4.7s ease-in-out infinite -3s; }
        .hero-particle.p6 { top: 47%; left: -2%; width: 3px; height: 3px; animation: drift 28s linear infinite -2s, twinkle 4.3s ease-in-out infinite -1.5s; }
        .hero-particle.p7 { top: 30%; left: -2%; width: 2px; height: 2px; opacity: 0.5; animation: drift 36s linear infinite -20s, twinkle 5.9s ease-in-out infinite; }
        .hero-particle.p8 { top: 62%; left: -2%; width: 2px; height: 2px; opacity: 0.4; animation: drift 44s linear infinite -28s, twinkle 7.2s ease-in-out infinite; }

        @keyframes drift {
          from { transform: translateX(0); }
          to   { transform: translateX(105vw); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: var(--p-opacity, 0.8); }
          50%      { opacity: 0.15; }
        }

        .hero-scan {
          left: -10%;
          width: 8px;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(0, 200, 150, 0.0) 30%,
            rgba(0, 200, 150, 0.35) 50%,
            rgba(0, 200, 150, 0.0) 70%,
            transparent 100%
          );
          filter: blur(2px);
          animation: scanSweep 14s linear infinite;
        }
        @keyframes scanSweep {
          0%   { transform: translateX(0); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translateX(120vw); opacity: 0; }
        }

        .hero-grain {
          opacity: 0.025;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-grid,
          .hero-particle,
          .hero-scan {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
