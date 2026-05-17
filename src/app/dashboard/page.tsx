'use client';

import { ErrorMessage, LoadingSpinner } from '@/components/Common';
import MainLayout from '@/components/MainLayout';
import RequestMaintenanceButton from '@/components/RequestMaintenanceButton';
import SensorChart from '@/components/charts/SensorChart';
import { useDashboardStats, usePondStatuses, type PondStatus } from '@/hooks/useDashboardStats';
import { useAllPondsReadings, usePonds, type PondWithOwner, type Range } from '@/hooks/useApi';
import { STATUS_DOT_BG, STATUS_DOT_GLOW, STATUS_LABEL } from '@/lib/pondStatus';
import { useAuthStore } from '@/store/authStore';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
	const router = useRouter();
	const { status } = useSession();
	const { user } = useAuthStore();
	const { ponds, isLoading, error } = usePonds();
	const { stats } = useDashboardStats();
	const { byId: statusByPondId } = usePondStatuses();
	const isAdmin = user?.role === 'admin';
	const isOwner = user?.role === 'owner';
	const [range, setRange] = useState<Range>('7d');

	const RANGE_OPTIONS: { value: Range; label: string }[] = [
		{ value: 'today', label: 'Today' },
		{ value: '7d', label: '7d' },
		{ value: '14d', label: '14d' },
		{ value: '30d', label: '30d' },
	];

	const { payload: tempPayload } = useAllPondsReadings('temperature', range);
	const { payload: phPayload } = useAllPondsReadings('ph', range);
	const { payload: doxPayload } = useAllPondsReadings('dox', range);
	const { payload: salinityPayload } = useAllPondsReadings('salinity', range);

	useEffect(() => {
		if (status === 'unauthenticated') {
			router.replace('/login');
		}
	}, [status, router]);

	if (status === 'loading') {
		return (
			<MainLayout>
				<LoadingSpinner />
			</MainLayout>
		);
	}
	if (status === 'unauthenticated') return null;

	return (
		<MainLayout>
			<div className="space-y-8">
				<div className="flex items-end justify-between flex-wrap gap-4">
					<div>
						<div className="flex items-center gap-2 mb-2">
							<span className="live-dot" />
							<span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-emerald-300">
								Live Telemetry
							</span>
						</div>
						<h1 className="text-4xl font-bold text-white tracking-tight">
							Control Center
						</h1>
						<p className="text-slate-400 mt-1.5 text-sm">
							Realtime monitoring across all ponds
						</p>
					</div>
					<div className="text-right">
						<p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
							Server Time
						</p>
						<p className="text-mono text-lg font-semibold text-cyan-300">
							{new Date().toLocaleTimeString()}
						</p>
					</div>
				</div>

				{error && <ErrorMessage message="Failed to load ponds" />}

				{isLoading ? (
					<LoadingSpinner />
				) : ponds && ponds.length > 0 ? (
					<>
						<div>
							<div className="flex items-center justify-between mb-4">
								<h2 className="text-xs uppercase tracking-[0.18em] font-semibold text-slate-400">
									System Overview
								</h2>
								<span className="text-[10px] text-slate-500 font-mono">
									{ponds.length} nodes
								</span>
							</div>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
								<StatTile
									label="Total Ponds"
									value={String(stats?.totalPonds ?? ponds.length)}
									accent="cyan"
								/>
								<StatTile
									label="Active Sensors"
									value={
										stats
											? `${stats.activeSensors} / ${stats.totalSensors}`
											: `${ponds.length * 4}`
									}
									accent="emerald"
								/>
								<SystemStatusTile stats={stats} />
								<StatTile
									label="Last Update"
									value={
										stats?.lastReceivedAt
											? new Date(stats.lastReceivedAt).toLocaleTimeString()
											: '—'
									}
									accent="violet"
									mono
								/>
							</div>
						</div>

						<div>
							<div className="flex items-center justify-between mb-4">
								<h2 className="text-xs uppercase tracking-[0.18em] font-semibold text-slate-400">
									Pond Network
								</h2>
								<span className="text-[10px] text-slate-500 font-mono">
									tap to view
								</span>
							</div>
							<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
								{ponds.map((pond) => {
									const status = statusByPondId.get(pond.id);
									return (
										<div
											key={pond.id}
											className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-linear-to-br from-[rgba(20,28,51,0.85)] to-[rgba(15,23,42,0.85)] backdrop-blur-sm p-4 transition-all hover:-translate-y-0.5 hover:border-cyan-400/50 hover:shadow-[0_0_30px_-12px_rgba(34,211,238,0.5)]">
											<Link
												href={`/dashboard/${pond.id}`}
												aria-label={`View ${pond.name}`}
												className="absolute inset-0 z-10"
											/>
											<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-400/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
											<div className="pointer-events-none">
												<div className="flex items-start justify-between mb-2">
													<div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300">
														<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
															<path d="M2 17a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v0M12 17a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v0" />
															<path d="M2 12a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5M12 12a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5" />
														</svg>
													</div>
													<PondStatusDot status={status} />
												</div>
												<p className="font-semibold text-slate-100 text-sm truncate">
													{pond.name}
												</p>
												<p className="text-[11px] text-slate-400 mt-0.5 truncate">
													{pond.location}
												</p>
												{isAdmin && (pond as PondWithOwner).company_name && (
													<p className="text-[10px] text-violet-300 mt-2 font-medium uppercase tracking-wider truncate">
														{(pond as PondWithOwner).company_name}
													</p>
												)}
												{isOwner && (
													<div className="mt-3 pointer-events-auto relative z-20">
														<RequestMaintenanceButton
															pondId={Number(pond.id)}
															pondName={pond.name}
														/>
													</div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>

						<div>
							<div className="flex items-center justify-between mb-4 flex-wrap gap-2">
								<h2 className="text-xs uppercase tracking-[0.18em] font-semibold text-slate-400">
									Sensor Trends &middot; All Ponds
								</h2>
								<div className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border)] bg-white/3">
									{RANGE_OPTIONS.map((opt) => (
										<button
											key={opt.value}
											onClick={() => setRange(opt.value)}
											className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
												range === opt.value
													? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_-5px_rgba(34,211,238,0.6)]'
													: 'text-slate-400 hover:text-slate-200'
											}`}>
											{opt.label}
										</button>
									))}
								</div>
							</div>
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
								<SensorChart
									mode={tempPayload?.mode === 'aggregated' ? 'aggregated' : 'raw'}
									sensor="temperature"
									unit="°C"
									label="Temperature"
									range={range}
									data={tempPayload?.mode === 'raw' ? tempPayload.data : undefined}
									aggregated={
										tempPayload?.mode === 'aggregated' ? tempPayload.data : undefined
									}
									bucketSize={
										tempPayload?.mode === 'aggregated'
											? tempPayload.bucketSize
											: undefined
									}
								/>
								<SensorChart
									mode={phPayload?.mode === 'aggregated' ? 'aggregated' : 'raw'}
									sensor="ph"
									unit="pH"
									label="pH Level"
									range={range}
									data={phPayload?.mode === 'raw' ? phPayload.data : undefined}
									aggregated={
										phPayload?.mode === 'aggregated' ? phPayload.data : undefined
									}
									bucketSize={
										phPayload?.mode === 'aggregated' ? phPayload.bucketSize : undefined
									}
								/>
								<SensorChart
									mode={doxPayload?.mode === 'aggregated' ? 'aggregated' : 'raw'}
									sensor="dissolved_oxygen"
									unit="mg/L"
									label="Dissolved Oxygen"
									range={range}
									data={doxPayload?.mode === 'raw' ? doxPayload.data : undefined}
									aggregated={
										doxPayload?.mode === 'aggregated' ? doxPayload.data : undefined
									}
									bucketSize={
										doxPayload?.mode === 'aggregated' ? doxPayload.bucketSize : undefined
									}
								/>
								<SensorChart
									mode={salinityPayload?.mode === 'aggregated' ? 'aggregated' : 'raw'}
									sensor="salinity"
									unit="ppt"
									label="Salinity"
									range={range}
									data={
										salinityPayload?.mode === 'raw' ? salinityPayload.data : undefined
									}
									aggregated={
										salinityPayload?.mode === 'aggregated'
											? salinityPayload.data
											: undefined
									}
									bucketSize={
										salinityPayload?.mode === 'aggregated'
											? salinityPayload.bucketSize
											: undefined
									}
								/>
							</div>
						</div>
					</>
				) : (
					<ErrorMessage message="No ponds available" />
				)}
			</div>
		</MainLayout>
	);
}

function SystemStatusTile({
	stats,
}: {
	stats:
		| {
				systemStatus: 'healthy' | 'degraded' | 'offline';
				lastReceivedAt: string | null;
				minutesSinceLastData: number | null;
		  }
		| undefined;
}) {
	if (!stats) {
		return <StatTile label="System Status" value="—" accent="violet" />;
	}
	const map = {
		healthy: { value: 'Healthy', accent: 'emerald' as const, pulse: true },
		degraded: { value: 'Degraded', accent: 'rose' as const, pulse: false },
		offline: { value: 'Offline', accent: 'rose' as const, pulse: false },
	}[stats.systemStatus];

	let sub = '';
	if (stats.systemStatus === 'degraded' && stats.minutesSinceLastData !== null) {
		sub = `Last data ${Math.floor(stats.minutesSinceLastData)} min ago`;
	} else if (stats.systemStatus === 'offline' && stats.lastReceivedAt) {
		sub = `No data since ${new Date(stats.lastReceivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
	} else if (stats.systemStatus === 'offline') {
		sub = 'No data received';
	}

	return (
		<StatTile
			label="System Status"
			value={map.value}
			accent={map.accent}
			pulse={map.pulse}
			sub={sub}
		/>
	);
}

function PondStatusDot({ status }: { status: PondStatus | undefined }) {
	const key = status?.status ?? 'offline';
	const minutes = status?.minutesSinceLastData;
	const mins = minutes == null ? null : Math.floor(minutes);
	const dataTip =
		minutes === null || minutes === undefined
			? 'No data received'
			: key === 'online'
				? `Last data ${mins} mins ago (within interval)`
				: key === 'stale'
					? `Last data ${mins} mins ago (missed 1–2 intervals)`
					: key === 'offline'
						? `No data for ${mins} mins (ESP32 may be offline)`
						: `Last data ${mins} mins ago`;

	const tooltip =
		key === 'maintenance' ? `Maintenance · ${dataTip}` : `${STATUS_LABEL[key]} · ${dataTip}`;
	const animate = key === 'online';

	return (
		<span
			title={tooltip}
			className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_DOT_BG[key]} ${STATUS_DOT_GLOW[key]} ${animate ? 'animate-[pulse-dot_1.6s_ease-in-out_infinite]' : ''}`}
		/>
	);
}

function StatTile({
	label,
	value,
	accent,
	pulse,
	mono,
	sub,
}: {
	label: string;
	value: string;
	accent: 'cyan' | 'emerald' | 'violet' | 'rose';
	pulse?: boolean;
	mono?: boolean;
	sub?: string;
}) {
	const map = {
		cyan: { text: 'text-cyan-300', bar: '#22d3ee' },
		emerald: { text: 'text-emerald-300', bar: '#34d399' },
		violet: { text: 'text-violet-300', bar: '#a78bfa' },
		rose: { text: 'text-rose-300', bar: '#fb7185' },
	}[accent];
	return (
		<div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-linear-to-br from-[rgba(20,28,51,0.85)] to-[rgba(15,23,42,0.85)] backdrop-blur-sm p-5">
			<div
				className="absolute inset-x-0 top-0 h-px"
				style={{ background: `linear-gradient(90deg, transparent, ${map.bar}80, transparent)` }}
			/>
			<div className="flex items-center justify-between">
				<p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-400">
					{label}
				</p>
				{pulse && <span className="live-dot" />}
			</div>
			<p
				className={`mt-2 font-bold ${map.text} ${mono ? 'text-mono text-base' : 'text-3xl'} truncate`}>
				{value}
			</p>
			{sub && (
				<p className="mt-1 text-[10px] text-slate-500 truncate">{sub}</p>
			)}
		</div>
	);
}
