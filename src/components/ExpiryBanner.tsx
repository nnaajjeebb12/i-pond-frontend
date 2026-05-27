'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

type ExpiryPayload = {
	expiresAt: string | null;
	daysUntilExpiry: number | null;
};

async function fetcher(url: string): Promise<ExpiryPayload> {
	const res = await fetch(url, { credentials: 'include' });
	if (!res.ok) throw new Error(`${url} -> ${res.status}`);
	return (await res.json()) as ExpiryPayload;
}

export default function ExpiryBanner() {
	const pathname = usePathname();
	const [dismissed, setDismissed] = useState(false);
	const { data } = useSWR<ExpiryPayload>('/api/auth/expiry', fetcher, {
		refreshInterval: 60 * 60 * 1000,
		revalidateOnFocus: false,
	});

	if (pathname === '/login') return null;
	if (dismissed) return null;
	if (!data || data.daysUntilExpiry === null) return null;

	const days = data.daysUntilExpiry;
	if (days > 30) return null;

	const critical = days <= 7;
	const wrapCls = critical
		? 'bg-rose-500/10 border-b border-rose-400/30'
		: 'bg-amber-500/10 border-b border-amber-400/30';
	const textCls = critical ? 'text-rose-300' : 'text-amber-300';
	const icon = critical ? '⚠' : '⚠';
	const msg = critical
		? `${icon} Your subscription expires in ${days} day${days === 1 ? '' : 's'}! Contact `
		: `${icon} Your subscription expires in ${days} day${days === 1 ? '' : 's'}. Contact `;

	return (
		<div className={`${wrapCls} px-4 py-2 flex items-center justify-between`}>
			<span className={`${textCls} text-sm`}>
				{msg}
				<a
					href="mailto:sales@soletronix.com"
					className="underline font-semibold">
					sales@soletronix.com
				</a>
				{critical ? ' immediately.' : ' to renew.'}
			</span>
			<button
				onClick={() => setDismissed(true)}
				aria-label="Dismiss"
				className={`${textCls} ml-3 px-2 py-0.5 rounded hover:bg-white/5`}>
				✕
			</button>
		</div>
	);
}
