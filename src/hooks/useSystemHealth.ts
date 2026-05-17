'use client';

import useSWR from 'swr';
import { useRef } from 'react';

type HealthState = 'live' | 'stale' | 'offline' | 'loading';

type Pond = { id: string };
type LatestPayload = {
	timestamp: number | null;
};

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;

async function fetcher<T>(url: string): Promise<T> {
	const res = await fetch(url, { credentials: 'include' });
	if (!res.ok) throw new Error(`${url} -> ${res.status}`);
	return (await res.json()) as T;
}

function formatAge(ms: number | null): string {
	if (ms === null || !isFinite(ms)) return '—';
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

export function useSystemHealth() {
	const pondsSWR = useSWR<Pond[]>('/api/ponds', fetcher, {
		refreshInterval: 15_000,
		revalidateOnFocus: false,
	});

	const firstPondId = pondsSWR.data?.[0]?.id ?? null;

	const latestSWR = useSWR<LatestPayload>(
		firstPondId ? `/api/readings/latest?pond=${encodeURIComponent(firstPondId)}` : null,
		fetcher,
		{
			refreshInterval: 30_000,
			revalidateOnFocus: false,
		},
	);

	const apiOk = !pondsSWR.error && !!pondsSWR.data;
	const apiLoading = pondsSWR.isLoading && !pondsSWR.data;
	const latestTs = latestSWR.data?.timestamp ?? null;
	const now = useRef(Date.now());
	const age = latestTs !== null ? now.current - latestTs : null;

	let state: HealthState;
	let label: string;
	let detail: string;

	if (apiLoading) {
		state = 'loading';
		label = 'CONNECTING';
		detail = 'Checking link…';
	} else if (!apiOk) {
		state = 'offline';
		label = 'OFFLINE';
		detail = 'API unreachable';
	} else if (!firstPondId) {
		state = 'offline';
		label = 'NO NODES';
		detail = 'No ponds configured';
	} else if (age === null) {
		state = 'offline';
		label = 'NO DATA';
		detail = 'Never received a reading';
	} else if (age < FRESH_MS) {
		state = 'live';
		label = 'SYSTEM LIVE';
		detail = `Last reading ${formatAge(age)}`;
	} else if (age < STALE_MS) {
		state = 'stale';
		label = 'STALE';
		detail = `Last reading ${formatAge(age)}`;
	} else {
		state = 'offline';
		label = 'OFFLINE';
		detail = `Last reading ${formatAge(age)}`;
	}

	return { state, label, detail, age, apiOk };
}
