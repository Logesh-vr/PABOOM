export function Icon({
  name,
  size = 18,
}: {
  name:
    | 'camera'
    | 'play'
    | 'stop'
    | 'arrow'
    | 'volume'
    | 'swap'
    | 'help'
    | 'close'
    | 'music'
    | 'expand'
    | 'collapse'
    | 'check';
  size?: number;
}) {
  const paths = {
    camera: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="3" />
        <path d="m16 10 5-3v10l-5-3" />
      </>
    ),
    play: <path d="m9 5 11 7-11 7z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    volume: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5zM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" />
      </>
    ),
    swap: (
      <>
        <path d="M4 8h16l-4-4M20 16H4l4 4" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    music: (
      <>
        <path d="M9 18V5l11-2v13M9 8l11-2" />
        <ellipse cx="6" cy="18" rx="3" ry="2" />
        <ellipse cx="17" cy="16" rx="3" ry="2" />
      </>
    ),
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    collapse: <path d="M3 9h6V3m6 0v6h6M9 21v-6H3m18 0h-6v6" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
