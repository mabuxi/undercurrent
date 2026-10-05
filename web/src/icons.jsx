const PATHS = {
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  comment: 'M4 5h16v11H9l-5 4z',
  flame: 'M12 2c.5 3.5 5 5.5 5 11a5 5 0 0 1-10 0c0-2.4 1-4 2.5-5.2.1 1.7.9 2.9 2.2 3.2C11 8.5 10.8 5.3 12 2z',
  ask: 'M4 5h16v11h-7l-5 4v-4H4zM10 9a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.3M12 14h.01',
  why: 'M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  save: 'M6 4h12v17l-6-4-6 4z',
  go: 'M5 12h14M13 6l6 6-6 6',
  phone: 'M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM10.5 18.5h3',
  translate: 'M4 5h8M8 3v2M10 5c-1 4-3 7-6 9M6 9c1 2 3 4 6 5M13 21l4-9 4 9M14.5 18h5',
  less: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a11 11 0 0 1-2.6 3.4M6.3 6.4C4.2 7.8 3 10.2 3 12c0 2 4 7 9 7 1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  play: 'M7 4.5v15l12.5-7.5z',
  loop: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  expand: 'M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6',
  min: 'M6 12h12',
  plus: 'M12 6v12M6 12h12',
  close: 'M7 7l10 10M17 7 7 17',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  home: 'M4 11.5 12 4l8 7.5M6 10v9h12v-9',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  chevL: 'M15 5l-7 7 7 7',
  chevR: 'M9 5l7 7-7 7',
  chevD: 'M6 9l6 6 6-6',
  dots: 'M4 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0zM10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0zM16 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0z',
  pin: 'M9 4h6l-1 6 4 3H6l4-3zM12 13v7',
  check: 'M5 12l5 5 9-10',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  grid: 'M4 4h9v16H4zM15 4h5v7h-5zM15 13h5v7h-5z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  bolt: 'M13 3 5 13h6l-1 8 8-10h-6z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  timer: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  images: 'M7 3h14v14H7zM3 7v14h14M7 13l4-4 3 3 2-2 5 5',
  thread: 'M4 5h16v10H9l-5 4zM8 9h8M8 12h5',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  female: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 14v7M9 18h6',
  male: 'M10 20a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM14.5 9.5 20 4M15 4h5v5',
  trans: 'M12 16a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 16v6M9.5 19.5h5M15.2 7.8 19 4M16 4h3v3M8.8 7.8 5 4M5 7V4h3',
  auto: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.2-4.2',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  x: 'M8 8l8 8M16 8l-8 8'
};

export function Icon({ name, filled = false, size }) {
  const style = size ? { width: size, height: size } : undefined;
  if (filled) {
    return <svg className="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}><path d={PATHS[name]} /></svg>;
  }
  return (
    <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={PATHS[name]} />
    </svg>
  );
}

export const FLAME_PATH = PATHS.flame;
