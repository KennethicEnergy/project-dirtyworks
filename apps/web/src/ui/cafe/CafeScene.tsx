/**
 * The cafe backdrop: wall, window, pendant lamps, a shelf of RC vehicles and the counter.
 * Pure decoration (aria-hidden); the chalkboard is a real DOM component layered on top.
 */
function ShelfTruck({ x, y, color = "#f5c518" }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="-22" width="34" height="14" rx="2" fill={color} />
      <path d="M34 -22 h14 l6 8 v6 h-20 z" fill={color} />
      <rect x="38" y="-20" width="8" height="6" rx="1" fill="#9bc7d6" />
      <circle cx="10" cy="-5" r="5" fill="#2b2622" />
      <circle cx="44" cy="-5" r="5" fill="#2b2622" />
    </g>
  );
}

function ShelfDigger({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="-10" width="36" height="10" rx="5" fill="#2b2622" />
      <rect x="4" y="-22" width="26" height="12" rx="2" fill="#f5c518" />
      <rect x="6" y="-32" width="13" height="11" rx="2" fill="#f5c518" />
      <path d="M28 -20 l12 -16 l4 2 l-11 16 z" fill="#e0ad10" />
      <path d="M40 -36 l10 10 l-3 3 l-9 -9 z" fill="#e0ad10" />
      <path d="M47 -26 l7 3 l-2 8 l-8 -3 z" fill="#2b2622" />
    </g>
  );
}

function ShelfDozer({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="6" y="-10" width="34" height="10" rx="5" fill="#2b2622" />
      <rect x="10" y="-24" width="26" height="14" rx="2" fill="#e9822e" />
      <rect x="22" y="-34" width="12" height="10" rx="2" fill="#e9822e" />
      <path d="M0 -20 h5 v18 h-7 z" fill="#3a3a3a" />
    </g>
  );
}

function Lamp({ x }: { x: number }) {
  return (
    <g>
      <line x1={x} y1="0" x2={x} y2="120" stroke="#1b120c" strokeWidth="3" />
      <ellipse cx={x} cy="190" rx="130" ry="70" fill="url(#lampGlow)" />
      <path d={`M${x - 34} 150 Q${x} 112 ${x + 34} 150 Z`} fill="#b5452f" />
      <ellipse cx={x} cy="150" rx="34" ry="6" fill="#f2df8a" />
    </g>
  );
}

export function CafeScene({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3323" />
          <stop offset="1" stopColor="#2c1d13" />
        </linearGradient>
        <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4b6e" />
          <stop offset="0.6" stopColor="#c9785a" />
          <stop offset="1" stopColor="#f2b27a" />
        </linearGradient>
        <radialGradient id="lampGlow">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
        <pattern id="bricks" width="60" height="30" patternUnits="userSpaceOnUse">
          <rect width="60" height="30" fill="#7a3a2a" />
          <rect x="1" y="1" width="58" height="13" rx="2" fill="#93473a" />
          <rect x="-29" y="16" width="58" height="13" rx="2" fill="#8a4234" />
          <rect x="31" y="16" width="58" height="13" rx="2" fill="#8a4234" />
        </pattern>
        <linearGradient id="counterTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a36" />
          <stop offset="1" stopColor="#5b3820" />
        </linearGradient>
      </defs>

      <rect width="1600" height="1000" fill="url(#wall)" />

      {/* window */}
      <g transform="translate(1180 120)">
        <rect width="300" height="260" rx="10" fill="url(#dusk)" />
        <circle cx="210" cy="190" r="34" fill="#f8d79a" opacity="0.85" />
        <path
          d="M0 210 L60 170 L120 200 L190 150 L300 205 V260 H0 Z"
          fill="#4b3a52"
          opacity="0.8"
        />
        <rect x="145" width="10" height="260" fill="#5b3820" />
        <rect y="125" width="300" height="10" fill="#5b3820" />
        <rect width="300" height="260" rx="10" fill="none" stroke="#5b3820" strokeWidth="14" />
      </g>

      {/* shelf of RC vehicles */}
      <g transform="translate(110 360)">
        <rect x="0" y="0" width="520" height="14" rx="3" fill="#6e4428" />
        <ShelfDigger x={30} y={0} />
        <ShelfTruck x={130} y={0} />
        <ShelfDozer x={250} y={0} />
        <ShelfTruck x={340} y={0} color="#4f86c6" />
        <ShelfDigger x={440} y={0} />
        <rect x="0" y="120" width="520" height="14" rx="3" fill="#6e4428" />
        <ShelfDozer x={40} y={120} />
        <ShelfTruck x={140} y={120} color="#b5452f" />
        <ShelfDigger x={270} y={120} />
        <ShelfTruck x={380} y={120} color="#3f6b48" />
      </g>

      <Lamp x={360} />
      <Lamp x={820} />
      <Lamp x={1280} />

      {/* backsplash and counter */}
      <rect x="0" y="690" width="1600" height="110" fill="url(#bricks)" opacity="0.9" />
      <rect x="0" y="790" width="1600" height="26" fill="url(#counterTop)" />
      <rect x="0" y="816" width="1600" height="184" fill="#3b2516" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={40 + i * 180} y="840" width="150" height="140" rx="8" fill="#452b19" />
      ))}

      {/* espresso machine and cups */}
      <g transform="translate(1250 650)">
        <rect width="190" height="140" rx="12" fill="#c9c2b8" />
        <rect x="14" y="14" width="162" height="40" rx="6" fill="#8d877f" />
        <rect x="40" y="70" width="18" height="34" fill="#3a3a3a" />
        <rect x="130" y="70" width="18" height="34" fill="#3a3a3a" />
        <rect x="32" y="112" width="34" height="24" rx="4" fill="#f6ecd9" />
        <circle cx="160" cy="34" r="9" fill="#b5452f" />
      </g>
      <g transform="translate(980 760)">
        <rect width="34" height="30" rx="5" fill="#f6ecd9" />
        <rect x="48" width="34" height="30" rx="5" fill="#d0624a" />
        <path d="M34 8 q12 0 12 9 q0 9 -12 9" fill="none" stroke="#f6ecd9" strokeWidth="5" />
      </g>

      {/* plant */}
      <g transform="translate(70 640)">
        <rect x="20" y="90" width="70" height="60" rx="8" fill="#b5452f" />
        <path d="M55 92 C20 40 10 30 0 10 C40 30 50 50 55 92 Z" fill="#3f6b48" />
        <path d="M55 92 C70 30 90 20 110 0 C95 40 80 60 55 92 Z" fill="#4f7a52" />
        <path d="M55 92 C50 40 55 20 60 -10 C70 30 66 60 55 92 Z" fill="#5d8a5d" />
      </g>
    </svg>
  );
}
