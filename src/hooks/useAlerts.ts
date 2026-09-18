'use client';

import useSWR, { mutate as globalMutate } from 'swr';

const UNREAD_KEY = '/api/notifications/unread-count';
const ACTIVE_KEY = '/api/alerts/active';

export type ActiveAlert = {
	id: string;
	pondId: number;
	pondName: string;
	sensor: string;
	triggeredAt: string;
	consecutiveCount: number;
	lastValue: number;
	optimalMin: number;
	optimalMax: number;
};

async function fetcher(url: string): Promise<ActiveAlert[]> {
	const res = await fetch(url, { credentials: 'include' });
	if (!res.ok) {
		if (res.status === 401) return [];
		throw new Error(`${url} -> ${res.status}`);
	}
	return (await res.json()) as ActiveAlert[];
}

export function useActiveAlerts() {
	const { data, error, mutate, isLoading } = useSWR<ActiveAlert[]>(
		ACTIVE_KEY,
		fetcher,
		{ refreshInterval: 30_000, revalidateOnFocus: false },
	);
	return { alerts: data, mutate, isLoading, error };
}

async function readError(res: Response, fallback: string): Promise<string> {
	try {
		const j = (await res.json()) as { error?: string };
		return j.error ?? fallback;
	} catch {
		return fallback;
	}
}

// Anything that acknowledges must also revalidate the unread-count badge.
function revalidateAlerts() {
	void globalMutate(ACTIVE_KEY);
	void globalMutate(UNREAD_KEY);
}

export async function acknowledgeAlert(id: string): Promise<void> {
	const res = await fetch(`/api/alerts/${id}/acknowledge`, {
		method: 'POST',
		credentials: 'include',
	});
	if (!res.ok) throw new Error(await readError(res, `ack failed -> ${res.status}`));
	revalidateAlerts();
}

export async function acknowledgeAllAlerts(): Promise<number> {
	const res = await fetch('/api/alerts/acknowledge-all', {
		method: 'POST',
		credentials: 'include',
	});
	if (!res.ok) throw new Error(await readError(res, `ack all failed -> ${res.status}`));
	const j = (await res.json()) as { acknowledged?: number };
	revalidateAlerts();
	return j.acknowledged ?? 0;
}

// "Ignore" is browser-only: hides the alert for this tab session without
// touching the server. Keyed by pondId:sensor, not alert id — a re-raised
// alert has a new id but is the same thing the user already ignored.
const IGNORE_KEY = 'ipond:ignoredAlerts';

export function alertKey(a: Pick<ActiveAlert, 'pondId' | 'sensor'>): string {
	return `${a.pondId}:${a.sensor}`;
}

export function loadIgnored(): Set<string> {
	try {
		const raw = sessionStorage.getItem(IGNORE_KEY);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch {
		return new Set();
	}
}

export function saveIgnored(keys: Set<string>): void {
	try {
		sessionStorage.setItem(IGNORE_KEY, JSON.stringify(Array.from(keys)));
	} catch {
		// private window / storage blocked — ignore silently
	}
}

export type UnreadCount = {
	total: number;
	maintenance: number;
	alerts: number;
};

async function unreadFetcher(url: string): Promise<UnreadCount> {
	const res = await fetch(url, { credentials: 'include' });
	if (!res.ok) return { total: 0, maintenance: 0, alerts: 0 };
	return (await res.json()) as UnreadCount;
}

export function useUnreadCount() {
	const { data } = useSWR<UnreadCount>(
		UNREAD_KEY,
		unreadFetcher,
		{ refreshInterval: 60_000, revalidateOnFocus: false },
	);
	return data ?? { total: 0, maintenance: 0, alerts: 0 };
}
