export function formatFastBreakMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalHundredths = Math.floor(safe / 10);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(totalHundredths / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }
  return `${seconds}.${String(hundredths).padStart(2, '0')}s`;
}

export function formatSplitDeltaMs(deltaMs: number): string {
  const sign = deltaMs > 0 ? '+' : '-';
  const absSeconds = Math.abs(deltaMs) / 1000;
  return `${sign}${absSeconds.toFixed(2)}s`;
}
