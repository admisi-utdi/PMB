import type { ApiResult, PmbData, SchoolSearchResult } from '@/types/pmb';

const DEFAULT_TIMEOUT_MS = 20000;

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_API_URL belum dikonfigurasi di .env.local');
  }
  return url.replace(/\/$/, '');
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0, ...init } = options;
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (attempt >= retries) throw error;
      attempt += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 400 * attempt));
    }
  }
}

export function getAllPmbData(): Promise<PmbData> {
  return fetchJson<PmbData>(`${getApiUrl()}?action=all`, {
    method: 'GET',
    timeoutMs: 20000,
    retries: 1,
  });
}

export function postPmbAction<T extends ApiResult = ApiResult>(payload: Record<string, unknown>, timeoutMs = 20000): Promise<T> {
  return fetchJson<T>(getApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    timeoutMs,
    retries: 0,
  });
}

export function searchSchools(query: string): Promise<SchoolSearchResult[]> {
  return fetchJson<SchoolSearchResult[]>(`${getApiUrl()}?action=cari_sekolah&q=${encodeURIComponent(query)}`, {
    method: 'GET',
    timeoutMs: 12000,
    retries: 1,
  });
}
