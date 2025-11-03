type RateLimitEntry = {
  attempts: number;
  firstAttemptTimestamp: number;
  blockedUntil?: number;
};

type RateLimitOutcome = {
  blocked: boolean;
  retryAfterMs?: number;
};

const ATTEMPTS = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS ?? 5 * 60 * 1000);
const BLOCK_DURATION_MS = Number(process.env.LOGIN_BLOCK_MS ?? 15 * 60 * 1000);

function getEntry(key: string, now: number): RateLimitEntry | undefined {
  const entry = ATTEMPTS.get(key);
  if (!entry) {
    return undefined;
  }

  // Unblock if the penalty period has elapsed.
  if (entry.blockedUntil && entry.blockedUntil <= now) {
    ATTEMPTS.delete(key);
    return undefined;
  }

  // Reset the window once the observation window expires.
  if (!entry.blockedUntil && entry.firstAttemptTimestamp + WINDOW_MS <= now) {
    ATTEMPTS.delete(key);
    return undefined;
  }

  return entry;
}

export function isRateLimited(key: string): RateLimitOutcome {
  const now = Date.now();
  const entry = getEntry(key, now);
  if (!entry) {
    return { blocked: false };
  }

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { blocked: true, retryAfterMs: entry.blockedUntil - now };
  }

  return { blocked: false };
}

export function registerFailedAttempt(key: string): RateLimitOutcome {
  const now = Date.now();
  const existing = getEntry(key, now);

  if (!existing) {
    ATTEMPTS.set(key, {
      attempts: 1,
      firstAttemptTimestamp: now
    });
    return { blocked: false };
  }

  if (existing.blockedUntil && existing.blockedUntil > now) {
    return { blocked: true, retryAfterMs: existing.blockedUntil - now };
  }

  existing.attempts += 1;

  if (existing.attempts >= MAX_ATTEMPTS) {
    existing.attempts = 0;
    existing.firstAttemptTimestamp = now;
    existing.blockedUntil = now + BLOCK_DURATION_MS;
    return { blocked: true, retryAfterMs: BLOCK_DURATION_MS };
  }

  return { blocked: false };
}

export function resetAttempts(key: string): void {
  ATTEMPTS.delete(key);
}

