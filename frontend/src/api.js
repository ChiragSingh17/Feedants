import { API_BASE, COMPETITION_SLUG } from './config';

function headers(userId, extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': userId,
    ...extra,
  };
}

export async function fetchCompetition(userId) {
  const res = await fetch(`${API_BASE}/api/competitions/${COMPETITION_SLUG}`, {
    headers: headers(userId),
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function registerCompetition(userId, idempotencyKey) {
  const res = await fetch(`${API_BASE}/api/competitions/${COMPETITION_SLUG}/register`, {
    method: 'POST',
    headers: headers(userId, { 'x-idempotency-key': idempotencyKey }),
    body: JSON.stringify({ idempotencyKey }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Registration failed');
  return json.data;
}

export async function submitEntry(userId, submissionUrl) {
  const res = await fetch(`${API_BASE}/api/competitions/${COMPETITION_SLUG}/submit`, {
    method: 'POST',
    headers: headers(userId),
    body: JSON.stringify({ submissionUrl }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Submit failed');
  return json.data;
}
