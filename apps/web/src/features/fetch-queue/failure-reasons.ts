/** A failure reason in words: a short label and what it means for you. */
export interface FailureReason {
  label: string;
  explanation: string;
}

const REASONS: Record<string, FailureReason> = {
  BCP_UNAVAILABLE: {
    label: 'BCP unavailable',
    explanation: 'BCP didn’t answer, or answered with an error. Usually passes on a retry.',
  },
  BCP_RATE_LIMITED: {
    label: 'BCP rate limit',
    explanation: 'BCP asked the app to slow down. Retry a little later.',
  },
  BCP_SCHEMA_MISMATCH: {
    label: 'Unexpected answer from BCP',
    explanation:
      'BCP sent data in a shape the app doesn’t know. Retrying won’t help until the app is updated.',
  },
  BCP_AUTH: {
    label: 'Login refused',
    explanation: 'BCP refused the login for these. Check the BCP login in Settings, then retry.',
  },
  NOT_FOUND: {
    label: 'Not found',
    explanation: 'BCP no longer has these, or they never existed.',
  },
  EVENT_BLOCKED: {
    label: 'Event blocked',
    explanation: 'An admin blocked the event while these waited. Unblock it, then retry.',
  },
  NO_LIST: {
    label: 'No list on BCP',
    explanation: 'These players never submitted a list on BCP: nothing to retry.',
  },
  INTERNAL: {
    label: 'App error',
    explanation: 'Something went wrong inside the app. Retrying may help.',
  },
};

export function failureReason(code: string): FailureReason {
  return REASONS[code] ?? { label: code, explanation: 'No explanation recorded for this reason.' };
}
