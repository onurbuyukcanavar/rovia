/**
 * Özgün dekoratif çizim: topografik eş yükselti çizgileri üzerinde kıvrılan bir rota.
 * Rota görselin sağ yarısında kalır; sol taraf metin için boş bırakılır.
 */
export function RouteIllustration({ className }: { className?: string }) {
  const contours = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg viewBox="0 0 600 720" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="ri-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#16223a" />
          <stop offset="1" stopColor="#0a111d" />
        </linearGradient>
        <radialGradient id="ri-glow" cx="0.72" cy="0.22" r="0.5">
          <stop offset="0" stopColor="#e8912d" stopOpacity="0.28" />
          <stop offset="1" stopColor="#e8912d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="720" fill="url(#ri-bg)" />
      <rect width="600" height="720" fill="url(#ri-glow)" />
      <g fill="none" stroke="#f7f5f0" strokeOpacity="0.07" strokeWidth="1.2">
        {contours.map((i) => (
          <path
            key={i}
            d={`M-40 ${140 + i * 62} C 120 ${90 + i * 60}, 220 ${210 + i * 58}, 360 ${150 + i * 61} S 560 ${120 + i * 64}, 660 ${170 + i * 60}`}
          />
        ))}
      </g>
      <path
        d="M570 720 C 540 620, 400 620, 410 510 S 540 380, 450 300 S 390 200, 450 160"
        fill="none" stroke="#f7f5f0" strokeOpacity="0.9" strokeWidth="5" strokeLinecap="round"
      />
      <path
        d="M570 720 C 540 620, 400 620, 410 510 S 540 380, 450 300 S 390 200, 450 160"
        fill="none" stroke="#0e1726" strokeWidth="1.4" strokeDasharray="8 10" strokeLinecap="round"
      />
      {[
        [410, 510], [450, 300],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill="#0e1726" stroke="#f7f5f0" strokeWidth="3" />
      ))}
      <circle cx="450" cy="160" r="22" fill="#e8912d" fillOpacity="0.2" />
      <circle cx="450" cy="160" r="10" fill="#e8912d" />
    </svg>
  );
}
