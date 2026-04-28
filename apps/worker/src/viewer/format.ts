export function formatAgo(ts: number): string {
  const ms = Math.max(0, Date.now() - ts);
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export function formatAgoLong(ts: number): string {
  const ms = Math.max(0, Date.now() - ts);
  if (ms < 60_000) {
    const seconds = Math.round(ms / 1000);
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} ago`;
  }
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  const hours = Math.round(ms / 3_600_000);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

export function shortSessionId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 12)}...`;
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}
