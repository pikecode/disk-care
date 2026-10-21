export function bytes(value: number) {
  if (value < 1024) return `${Math.max(0, value)} B`;
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${(value / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${["B", "KiB", "MiB", "GiB", "TiB"][unit]}`;
}
