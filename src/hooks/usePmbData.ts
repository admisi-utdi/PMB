'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAllPmbData } from '@/lib/api';
import { readAnyCache, readCache, writeCache } from '@/lib/cache';
import type { PmbData } from '@/types/pmb';

const CACHE_KEY = 'pmb:data:all:v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

export function usePmbData() {
  const [data, setData] = useState<PmbData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (background = false) => {
    if (background) setIsValidating(true);
    else setIsLoading(true);

    try {
      const freshData = await getAllPmbData();
      setData(freshData);
      setError(null);
      writeCache(CACHE_KEY, freshData);
    } catch (err) {
      const fallback = readAnyCache<PmbData>(CACHE_KEY);
      if (fallback) {
        setData(fallback);
        setError('Data live gagal dimuat. Menampilkan cache terakhir.');
      } else {
        setError(err instanceof Error ? err.message : 'Gagal memuat data PMB.');
      }
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache<PmbData>(CACHE_KEY, CACHE_TTL_MS);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      void refresh(true);
      return;
    }

    void refresh(false);
  }, [refresh]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    retry: () => refresh(false),
  };
}
