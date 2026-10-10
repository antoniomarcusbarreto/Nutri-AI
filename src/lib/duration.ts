/** Duração em texto curto: 45 min, 1h, 1h30. */
export const fmtDuration = (m: number) => {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${m} min`;
  return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
};
