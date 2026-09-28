function msUntil(targetDate, now = new Date()) {
  return Math.max(0, new Date(targetDate).getTime() - now.getTime());
}

function formatCountdown(ms) {
  if (ms <= 0) return '00d : 00h : 00m : 00s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d)}d : ${pad(h)}h : ${pad(m)}m : ${pad(sec)}s`;
}

module.exports = { msUntil, formatCountdown };
