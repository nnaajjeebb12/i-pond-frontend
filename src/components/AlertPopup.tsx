'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	useActiveAlerts,
	acknowledgeAlert,
	acknowledgeAllAlerts,
	alertKey,
	loadIgnored,
	saveIgnored,
	type ActiveAlert,
} from '@/hooks/useAlerts';
import { useAuthStore } from '@/store/authStore';
import { fmt } from '@/lib/pondStatus';
import { usePathname } from 'next/navigation';

const SENSOR_LABELS: Record<string, { name: string; unit: string }> = {
	temperature: { name: 'Temperature', unit: '°C' },
	ph: { name: 'pH', unit: 'pH' },
	salinity: { name: 'Salinity', unit: 'ppt' },
	dissolved_oxygen: { name: 'Dissolved Oxygen', unit: 'mg/L' },
	connectivity: { name: 'Connectivity', unit: '' },
};

function formatGap(minutes: number): string {
	if (minutes < 0) return 'an unknown duration';
	if (minutes < 60) return `${Math.round(minutes)} minutes`;
	if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hours`;
	return `${(minutes / 1440).toFixed(1)} days`;
}

export default function AlertPopup() {
	const { isAuthenticated, user } = useAuthStore();
	const pathname = usePathname();
	const { alerts, mutate } = useActiveAlerts();
	const [mounted, setMounted] = useState(false);
	// Optimistically hidden (acknowledge in flight or done) — by alert id.
	const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
	// Ignored for this browser session — by pondId:sensor.
	const [ignored, setIgnored] = useState<Set<string>>(new Set());
	const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
	const [busyAll, setBusyAll] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setIgnored(loadIgnored());
		setMounted(true);
	}, []);

	if (!mounted) return null;
	if (!isAuthenticated) return null;
	if (pathname === '/login') return null;
	if (user?.role === 'viewer') return null;

	const visible: ActiveAlert[] =
		alerts?.filter((a) => !hiddenIds.has(a.id) && !ignored.has(alertKey(a))) ?? [];
	if (visible.length === 0) return null;

	function ignore(keys: string[]) {
		setIgnored((prev) => {
			const next = new Set(prev);
			for (const k of keys) next.add(k);
			saveIgnored(next);
			return next;
		});
	}

	// Optimistic: card disappears on click, request runs in the background,
	// failure brings it back with the reason.
	async function onAck(a: ActiveAlert) {
		setError(null);
		setBusyIds((s) => new Set(s).add(a.id));
		setHiddenIds((s) => new Set(s).add(a.id));
		try {
			await acknowledgeAlert(a.id);
			await mutate();
		} catch (err) {
			setHiddenIds((s) => {
				const n = new Set(s);
				n.delete(a.id);
				return n;
			});
			setError(`Acknowledge failed: ${(err as Error).message}`);
		} finally {
			setBusyIds((s) => {
				const n = new Set(s);
				n.delete(a.id);
				return n;
			});
		}
	}

	async function onAckAll() {
		setError(null);
		setBusyAll(true);
		const ids = visible.map((a) => a.id);
		setHiddenIds((s) => new Set([...s, ...ids]));
		try {
			await acknowledgeAllAlerts();
			await mutate();
		} catch (err) {
			setHiddenIds((s) => {
				const n = new Set(s);
				for (const id of ids) n.delete(id);
				return n;
			});
			setError(`Acknowledge all failed: ${(err as Error).message}`);
		} finally {
			setBusyAll(false);
		}
	}

	function onIgnoreAll() {
		ignore(visible.map(alertKey));
	}

	return createPortal(
		<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
			<div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-rose-500/40 bg-[rgba(15,23,42,0.96)] shadow-[0_0_40px_-10px_rgba(244,63,94,0.5)]">
				<div className="px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[rgba(15,23,42,0.96)] backdrop-blur">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<span className="text-xl">⚠️</span>
							<h2 className="font-bold text-rose-200 tracking-tight">
								Sensor Alert{visible.length > 1 ? 's' : ''}
							</h2>
							<span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold">
								{visible.length}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<button
								onClick={onIgnoreAll}
								disabled={busyAll}
								className="px-3 py-1.5 rounded-lg border border-slate-500/40 text-slate-300 hover:bg-white/5 text-xs font-semibold transition-colors disabled:opacity-50"
								title="Hide all for this browser session. Does not acknowledge on the server.">
								Ignore all
							</button>
							<button
								onClick={onAckAll}
								disabled={busyAll}
								className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-xs font-semibold transition-colors disabled:opacity-50">
								{busyAll ? 'Acknowledging…' : 'Acknowledge all'}
							</button>
						</div>
					</div>
					{error && (
						<p className="mt-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
							{error}
						</p>
					)}
				</div>
				<div className="p-4 space-y-3">
					{visible.map((a) => {
						const meta = SENSOR_LABELS[a.sensor] ?? {
							name: a.sensor,
							unit: '',
						};
						const isConnectivity = a.sensor === 'connectivity';
						const busy = busyIds.has(a.id) || busyAll;
						return (
							<div
								key={a.id}
								className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
								<p className="font-semibold text-white">
									⚠️ {a.pondName} — {isConnectivity ? 'No Data Received' : `${meta.name} Alert`}
								</p>
								{isConnectivity ? (
									<p className="text-sm text-slate-300 mt-1">
										No data received for {formatGap(a.lastValue)}. Check ESP32 device.
									</p>
								) : (
									<>
										<p className="text-sm text-slate-300 mt-1">
											{a.consecutiveCount} consecutive readings out of range (~1h 45m of abnormal data)
										</p>
										<p className="text-sm text-slate-400 mt-1 text-mono">
											Current: {fmt(a.lastValue)}
											{meta.unit} | Optimal: {fmt(a.optimalMin)}–{fmt(a.optimalMax)}
											{meta.unit}
										</p>
									</>
								)}
								<p className="text-[10px] text-slate-500 mt-1">
									Triggered {new Date(a.triggeredAt).toLocaleString()}
								</p>
								<div className="mt-3 grid grid-cols-2 gap-2">
									<button
										onClick={() => ignore([alertKey(a)])}
										disabled={busy}
										className="px-4 py-2 rounded-lg border border-slate-500/40 text-slate-300 hover:bg-white/5 text-sm font-semibold transition-colors disabled:opacity-50"
										title="Hide for this browser session. Does not acknowledge on the server.">
										Ignore
									</button>
									<button
										onClick={() => onAck(a)}
										disabled={busy}
										className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-sm font-semibold transition-colors disabled:opacity-50">
										{busyIds.has(a.id) ? 'Acknowledging…' : 'Acknowledge'}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>,
		document.body,
	);
}
