/** Original programmatic SVG solar house for the welcome screen. */
export function HouseIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 440 320"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Illustrated sunny house with solar panels on the roof"
    >
      <defs>
        <linearGradient id="welcomeSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ec1e8" />
          <stop offset="55%" stopColor="#b7e3f7" />
          <stop offset="100%" stopColor="#d8efc4" />
        </linearGradient>
        <linearGradient id="welcomeRoof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d96a3a" />
          <stop offset="100%" stopColor="#a94422" />
        </linearGradient>
        <linearGradient id="welcomePv" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a6aa8" />
          <stop offset="100%" stopColor="#143a66" />
        </linearGradient>
        <linearGradient id="welcomeWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="100%" stopColor="#f0e2c4" />
        </linearGradient>
        <radialGradient id="welcomeSunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe066" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffe066" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="440" height="320" rx="28" fill="url(#welcomeSky)" />

      {/* Distant hills */}
      <ellipse cx="70" cy="250" rx="120" ry="40" fill="#8fbf5a" opacity="0.55" />
      <ellipse cx="360" cy="255" rx="110" ry="36" fill="#7aaf4a" opacity="0.5" />

      {/* Sun */}
      <circle cx="360" cy="58" r="48" fill="url(#welcomeSunGlow)" />
      <circle cx="360" cy="58" r="26" fill="#f5c518" />
      <circle cx="352" cy="50" r="6" fill="#ffe9a0" opacity="0.55" />

      {/* Soft clouds */}
      <g fill="#ffffff" opacity="0.85">
        <ellipse cx="78" cy="62" rx="34" ry="14" />
        <ellipse cx="100" cy="56" rx="22" ry="16" />
        <ellipse cx="55" cy="58" rx="18" ry="12" />
        <ellipse cx="210" cy="42" rx="28" ry="11" />
        <ellipse cx="228" cy="38" rx="16" ry="12" />
      </g>

      {/* Ground / lawn */}
      <ellipse cx="220" cy="278" rx="168" ry="28" fill="#6eab3e" />
      <ellipse cx="220" cy="278" rx="150" ry="18" fill="#7fbf4a" opacity="0.7" />

      {/* Bushes */}
      <ellipse cx="92" cy="248" rx="28" ry="16" fill="#4f8f2e" />
      <ellipse cx="118" cy="252" rx="18" ry="12" fill="#5ea038" />
      <ellipse cx="340" cy="250" rx="30" ry="15" fill="#4f8f2e" />
      <ellipse cx="312" cy="254" rx="16" ry="11" fill="#5ea038" />

      {/* Flower dots */}
      <circle cx="100" cy="246" r="3" fill="#f5c518" />
      <circle cx="328" cy="248" r="3" fill="#ff8fab" />
      <circle cx="350" cy="244" r="2.5" fill="#f5c518" />

      {/* House shadow */}
      <ellipse cx="220" cy="268" rx="92" ry="10" fill="#3d6b28" opacity="0.28" />

      {/* House body */}
      <rect x="118" y="148" width="204" height="112" rx="8" fill="url(#welcomeWall)" stroke="#16384a" strokeWidth="3" />

      {/* Chimney */}
      <rect x="286" y="88" width="28" height="48" rx="3" fill="#c45c3a" stroke="#16384a" strokeWidth="2" />
      <rect x="280" y="82" width="40" height="10" rx="2" fill="#a94422" stroke="#16384a" strokeWidth="2" />
      <g opacity="0.45" fill="#ffffff">
        <ellipse cx="300" cy="70" rx="10" ry="5">
          <animate attributeName="cy" values="70;58;70" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.45;0.15;0.45" dur="3s" repeatCount="indefinite" />
        </ellipse>
      </g>

      {/* Roof */}
      <polygon
        points="100,152 220,58 340,152"
        fill="url(#welcomeRoof)"
        stroke="#16384a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <polygon points="112,148 220,72 328,148" fill="#e07a48" opacity="0.35" />

      {/* PV modules on roof */}
      <g transform="translate(148,92) skewX(-16)">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * 42}, 0)`}>
            <rect width="36" height="30" rx="3" fill="url(#welcomePv)" stroke="#c5d6e8" strokeWidth="2" />
            <line x1="12" y1="3" x2="12" y2="27" stroke="#9ec4e8" strokeOpacity="0.35" />
            <line x1="24" y1="3" x2="24" y2="27" stroke="#9ec4e8" strokeOpacity="0.35" />
            <line x1="3" y1="15" x2="33" y2="15" stroke="#9ec4e8" strokeOpacity="0.3" />
            <path d="M4 5 L14 4" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        ))}
      </g>

      {/* Door */}
      <rect x="198" y="188" width="44" height="72" rx="5" fill="#16384a" />
      <rect x="204" y="194" width="32" height="28" rx="2" fill="#2c5364" opacity="0.35" />
      <circle cx="232" cy="228" r="3.5" fill="#f5c518" />

      {/* Windows */}
      <rect x="138" y="176" width="36" height="36" rx="5" fill="#7ec8e8" stroke="#16384a" strokeWidth="2.5" />
      <rect x="266" y="176" width="36" height="36" rx="5" fill="#7ec8e8" stroke="#16384a" strokeWidth="2.5" />
      <line x1="156" y1="178" x2="156" y2="210" stroke="#16384a" strokeWidth="1.5" opacity="0.35" />
      <line x1="140" y1="194" x2="172" y2="194" stroke="#16384a" strokeWidth="1.5" opacity="0.35" />
      <line x1="284" y1="178" x2="284" y2="210" stroke="#16384a" strokeWidth="1.5" opacity="0.35" />
      <line x1="268" y1="194" x2="300" y2="194" stroke="#16384a" strokeWidth="1.5" opacity="0.35" />
      <rect x="142" y="179" width="10" height="8" rx="1" fill="#ffffff" opacity="0.45" />
      <rect x="270" y="179" width="10" height="8" rx="1" fill="#ffffff" opacity="0.45" />

      {/* Pathway */}
      <path d="M198 260 C210 268, 230 268, 242 260 L236 278 C224 284, 216 284, 204 278 Z" fill="#d2b48c" opacity="0.85" />
    </svg>
  )
}
