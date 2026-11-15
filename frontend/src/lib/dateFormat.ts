const MADA_OFFSET_MS = 3 * 3600 * 1000;

const SHORT_MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const LONG_MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

function getMadaParts(date: Date) {
  const shifted = new Date(date.getTime() + MADA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIdx: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: String(shifted.getUTCHours()).padStart(2, '0'),
    minute: String(shifted.getUTCMinutes()).padStart(2, '0'),
  };
}

/**
 * Formats a property's publication date using its exact original Facebook
 * publication hour in Madagascar time (UTC+3), rather than vague relative buckets.
 */
export function formatPublicationDateTime(
  dateString?: string | null,
  options?: { compact?: boolean; fallback?: string },
): string {
  const fallback = options?.fallback ?? 'Nouveau';
  if (!dateString) return fallback;

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return fallback;

  const target = getMadaParts(date);
  const now = new Date();
  const today = getMadaParts(now);
  const yesterday = getMadaParts(new Date(now.getTime() - 86_400_000));
  const timePart = `${target.hour}:${target.minute}`;

  const isToday =
    target.year === today.year &&
    target.monthIdx === today.monthIdx &&
    target.day === today.day;
  if (isToday) {
    return `${options?.compact ? 'Auj.' : "Aujourd'hui"} à ${timePart}`;
  }

  const isYesterday =
    target.year === yesterday.year &&
    target.monthIdx === yesterday.monthIdx &&
    target.day === yesterday.day;
  if (isYesterday) {
    return `Hier à ${timePart}`;
  }

  if (target.year === today.year) {
    return `${target.day} ${SHORT_MONTHS_FR[target.monthIdx]} à ${timePart}`;
  }

  if (options?.compact) {
    const mm = String(target.monthIdx + 1).padStart(2, '0');
    const dd = String(target.day).padStart(2, '0');
    const yy = String(target.year).slice(-2);
    return `${dd}/${mm}/${yy} à ${timePart}`;
  }

  return `${target.day} ${SHORT_MONTHS_FR[target.monthIdx]} ${target.year} à ${timePart}`;
}

/**
 * Full human-readable Madagascar publication date & hour for tooltips and audit titles.
 */
export function formatExactPublicationDateTime(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const p = getMadaParts(date);
  return `${p.day} ${LONG_MONTHS_FR[p.monthIdx]} ${p.year} à ${p.hour}:${p.minute}`;
}
