const CHINA_STANDARD_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function displayParts(value: string | number | Date) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid display timestamp');

  const shifted = new Date(instant.getTime() + CHINA_STANDARD_TIME_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: pad(shifted.getUTCMonth() + 1),
    day: pad(shifted.getUTCDate()),
    hour: pad(shifted.getUTCHours()),
    minute: pad(shifted.getUTCMinutes()),
    second: pad(shifted.getUTCSeconds()),
  };
}

export function formatDisplayDateTime(value: string | number | Date): string {
  const parts = displayParts(value);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} CST`;
}

export function formatDisplayDate(value: string | number | Date): string {
  const parts = displayParts(value);
  return `${parts.year}-${parts.month}-${parts.day} CST`;
}

export function formatDisplayInteger(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError('Display integer must be a safe integer');
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(value));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
