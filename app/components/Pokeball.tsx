export default function Pokeball({
  size = 24,
  className = '',
  muted = false,
}: {
  size?: number;
  className?: string;
  muted?: boolean;
}) {
  const top = muted ? '#B7BCC4' : '#E23B2E';
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#fff" stroke="#1B2340" strokeWidth="6" />
      <path d="M4 50a46 46 0 0 1 92 0z" fill={top} stroke="#1B2340" strokeWidth="6" strokeLinejoin="round" />
      <path d="M4 50h92" stroke="#1B2340" strokeWidth="6" />
      <circle cx="50" cy="50" r="14" fill="#fff" stroke="#1B2340" strokeWidth="6" />
      <circle cx="50" cy="50" r="5" fill="#fff" stroke="#1B2340" strokeWidth="3" />
    </svg>
  );
}
