'use client';

import { ErrorMessage, LoadingSpinner } from '@/components/Common';
import MainLayout from '@/components/MainLayout';
import { useAuthStore } from '@/store/authStore';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

type MaintenanceRow = {
	id: string;
	pondId: number;
	pondName: string;
	requestedByName: string | null;
	message: string;
	status: 'pending' | 'acknowledged' | 'resolved';
	createdAt: string;
	acknowledgedAt: string | null;
	resolvedAt: string | null;
	adminNote: string | null;
};

type AlertRow = {
	id: string;
	pondId: number;
	pondName: string;
	sensor: string;
	triggeredAt: string;
	consecutiveCount: number;
	lastValue: number;
	optimalMin: number;
	optimalMax: number;
	acknowledgedAt: string | null;
	acknowledgedByName: string | null;
	resolvedAt: string | null;
};

type AdminUserRow = {
	id: string;
	name: string;
	email: string;
	role: 'admin' | 'owner' | 'viewer';
	createdAt: string | null;
	expiresAt: string | null;
	pondIds: string[];
};

async function fetcher<T>(url: string): Promise<T> {
	const res = await fetch(url, { credentials: 'include' });
	if (!res.ok) throw new Error(`${url} -> ${res.status}`);
	return (await res.json()) as T;
}

const STATUS_BADGE: Record<MaintenanceRow['status'], string> = {
	pending: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
	acknowledged: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
	resolved: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
};

const SENSOR_LABEL: Record<string, string> = {
	temperature: 'Temperature',
	ph: 'pH',
	salinity: 'Salinity',
	dissolved_oxygen: 'Dissolved Oxygen',
	connectivity: 'Connectivity',
};

function formatDuration(mins: number): string {
	if (mins < 0) return 'Never received';
	if (mins < 60) return `${Math.round(mins)}m ago`;
	if (mins < 1440) return `${(mins / 60).toFixed(1)}h ago`;
	return `${(mins / 1440).toFixed(1)}d ago`;
}

export default function NotificationsPage() {
	const router = useRouter();
	const { status: sessionStatus } = useSession();
	const { user } = useAuthStore();
	const isAdmin = user?.role === 'admin';
	const [tab, setTab] = useState<'maintenance' | 'alerts' | 'expiring'>(
		'maintenance',
	);
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [pondFilter, setPondFilter] = useState<string>('all');

	useEffect(() => {
		if (sessionStatus === 'unauthenticated') router.replace('/login');
	}, [sessionStatus, router]);

	const { data: maintenance, error: mErr, isLoading: mLoading, mutate: mMutate } =
		useSWR<MaintenanceRow[]>('/api/maintenance', fetcher, {
			refreshInterval: 30_000,
		});

	const { data: alerts, error: aErr, isLoading: aLoading } = useSWR<AlertRow[]>(
		isAdmin ? '/api/alerts' : null,
		fetcher,
		{ refreshInterval: 30_000 },
	);

	const { data: adminUsers } = useSWR<AdminUserRow[]>(
		isAdmin ? '/api/admin/users' : null,
		fetcher,
		{ refreshInterval: 60_000 },
	);

	if (sessionStatus === 'loading') {
		return (
			<MainLayout>
				<LoadingSpinner />
			</MainLayout>
		);
	}
	if (sessionStatus === 'unauthenticated') return null;
	if (user?.role === 'viewer') {
		return (
			<MainLayout>
				<ErrorMessage message="Forbidden" />
			</MainLayout>
		);
	}

	async function patchMaintenance(
		id: string,
		next: 'acknowledged' | 'resolved',
	) {
		let note: string | null = null;
		if (next === 'acknowledged') {
			note = window.prompt('Optional note (e.g., Technician dispatched):') ?? null;
		}
		try {
			const res = await fetch(`/api/maintenance/${id}`, {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: next, adminNote: note }),
			});
			if (!res.ok) throw new Error(`status ${res.status}`);
			await mMutate();
		} catch (err) {
			console.error('patch_maintenance_failed', err);
		}
	}

	const ponds = Array.from(
		new Set(
			[
				...(maintenance ?? []).map((m) => `${m.pondId}|${m.pondName}`),
				...(alerts ?? []).map((a) => `${a.pondId}|${a.pondName}`),
			].sort(),
		),
	).map((s) => {
		const [id, name] = s.split('|');
		return { id, name };
	});

	const filteredMaintenance = (maintenance ?? []).filter((m) => {
		if (statusFilter !== 'all' && m.status !== statusFilter) return false;
		if (pondFilter !== 'all' && String(m.pondId) !== pondFilter) return false;
		return true;
	});

	const filteredAlerts = (alerts ?? []).filter((a) => {
		if (pondFilter !== 'all' && String(a.pondId) !== pondFilter) return false;
		if (statusFilter === 'active')
			return !a.acknowledgedAt && !a.resolvedAt;
		if (statusFilter === 'acknowledged')
			return !!a.acknowledgedAt && !a.resolvedAt;
		if (statusFilter === 'resolved') return !!a.resolvedAt;
		return true;
	});

	return (
		<MainLayout>
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold text-white tracking-tight">
						Notifications
					</h1>
					<p className="text-slate-400 mt-1 text-sm">
						{isAdmin
							? 'Maintenance requests and sensor alerts across all ponds'
							: 'Your maintenance requests'}
					</p>
				</div>

				<div className="flex items-center gap-2 border-b border-[var(--border)]">
					<TabButton
						active={tab === 'maintenance'}
						onClick={() => setTab('maintenance')}>
						Maintenance Requests
					</TabButton>
					{isAdmin && (
						<TabButton
							active={tab === 'alerts'}
							onClick={() => setTab('alerts')}>
							Sensor Alerts
						</TabButton>
					)}
					{isAdmin && (
						<TabButton
							active={tab === 'expiring'}
							onClick={() => setTab('expiring')}>
							Expiring Subscriptions
						</TabButton>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
						Status
					</label>
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
						className="px-3 py-1.5 rounded-md bg-white/5 border border-[var(--border)] text-sm">
						<option value="all">All</option>
						{tab === 'maintenance' ? (
							<>
								<option value="pending">Pending</option>
								<option value="acknowledged">Acknowledged</option>
								<option value="resolved">Resolved</option>
							</>
						) : (
							<>
								<option value="active">Active</option>
								<option value="acknowledged">Acknowledged</option>
								<option value="resolved">Resolved</option>
							</>
						)}
					</select>
					<label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 ml-2">
						Pond
					</label>
					<select
						value={pondFilter}
						onChange={(e) => setPondFilter(e.target.value)}
						className="px-3 py-1.5 rounded-md bg-white/5 border border-[var(--border)] text-sm">
						<option value="all">All</option>
						{ponds.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</div>

				{tab === 'expiring' ? (
					<ExpiringSubscriptions users={adminUsers ?? []} />
				) : tab === 'maintenance' ? (
					mLoading ? (
						<LoadingSpinner />
					) : mErr ? (
						<ErrorMessage message="Failed to load requests" />
					) : (
						<div className="overflow-x-auto rounded-xl border border-[var(--border)]">
							<table className="min-w-full text-sm">
								<thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
									<tr>
										<th className="text-left px-4 py-2.5">Received</th>
										<th className="text-left px-4 py-2.5">Pond</th>
										{isAdmin && <th className="text-left px-4 py-2.5">By</th>}
										<th className="text-left px-4 py-2.5">Message</th>
										<th className="text-left px-4 py-2.5">Status</th>
										{isAdmin && <th className="text-left px-4 py-2.5">Actions</th>}
									</tr>
								</thead>
								<tbody>
									{filteredMaintenance.length === 0 ? (
										<tr>
											<td
												colSpan={isAdmin ? 6 : 4}
												className="text-center py-8 text-slate-500">
												No requests
											</td>
										</tr>
									) : (
										filteredMaintenance.map((m) => (
											<tr
												key={m.id}
												className="border-t border-[var(--border)] hover:bg-white/3">
												<td className="px-4 py-3 text-mono text-[12px] text-slate-300 whitespace-nowrap">
													{new Date(m.createdAt).toLocaleString()}
												</td>
												<td className="px-4 py-3 font-semibold text-slate-100 whitespace-nowrap">
													{m.pondName}
												</td>
												{isAdmin && (
													<td className="px-4 py-3 text-slate-300 whitespace-nowrap">
														{m.requestedByName ?? '—'}
													</td>
												)}
												<td className="px-4 py-3 text-slate-200 max-w-md">
													<p>{m.message}</p>
													{m.adminNote && (
														<p className="mt-1 text-[11px] text-slate-400 italic">
															Note: {m.adminNote}
														</p>
													)}
												</td>
												<td className="px-4 py-3">
													<span
														className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${STATUS_BADGE[m.status]}`}>
														{m.status}
													</span>
												</td>
												{isAdmin && (
													<td className="px-4 py-3 whitespace-nowrap">
														<div className="flex gap-1.5">
															{m.status === 'pending' && (
																<button
																	onClick={() =>
																		patchMaintenance(m.id, 'acknowledged')
																	}
																	className="px-2.5 py-1 rounded text-[11px] font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/30">
																	Acknowledge
																</button>
															)}
															{m.status !== 'resolved' && (
																<button
																	onClick={() =>
																		patchMaintenance(m.id, 'resolved')
																	}
																	className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-400/30">
																	Resolve
																</button>
															)}
														</div>
													</td>
												)}
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					)
				) : aLoading ? (
					<LoadingSpinner />
				) : aErr ? (
					<ErrorMessage message="Failed to load alerts" />
				) : (
					<div className="overflow-x-auto rounded-xl border border-[var(--border)]">
						<table className="min-w-full text-sm">
							<thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
								<tr>
									<th className="text-left px-4 py-2.5">Triggered</th>
									<th className="text-left px-4 py-2.5">Pond</th>
									<th className="text-left px-4 py-2.5">Sensor</th>
									<th className="text-left px-4 py-2.5">Value</th>
									<th className="text-left px-4 py-2.5">Optimal</th>
									<th className="text-left px-4 py-2.5">Count</th>
									<th className="text-left px-4 py-2.5">Acknowledged By</th>
									<th className="text-left px-4 py-2.5">Resolved At</th>
								</tr>
							</thead>
							<tbody>
								{filteredAlerts.length === 0 ? (
									<tr>
										<td
											colSpan={8}
											className="text-center py-8 text-slate-500">
											No alerts
										</td>
									</tr>
								) : (
									filteredAlerts.map((a) => (
										<tr
											key={a.id}
											className="border-t border-[var(--border)] hover:bg-white/3">
											<td className="px-4 py-3 text-mono text-[12px] text-slate-300 whitespace-nowrap">
												{new Date(a.triggeredAt).toLocaleString()}
											</td>
											<td className="px-4 py-3 font-semibold text-slate-100 whitespace-nowrap">
												{a.pondName}
											</td>
											<td className="px-4 py-3 text-slate-200 whitespace-nowrap">
												{SENSOR_LABEL[a.sensor] ?? a.sensor}
											</td>
											<td className="px-4 py-3 text-mono text-rose-300">
												{a.sensor === 'connectivity'
													? formatDuration(a.lastValue)
													: a.lastValue.toFixed(2)}
											</td>
											<td className="px-4 py-3 text-mono text-slate-400">
												{a.sensor === 'connectivity'
													? '—'
													: `${a.optimalMin}–${a.optimalMax}`}
											</td>
											<td className="px-4 py-3 text-mono">
												{a.consecutiveCount}
											</td>
											<td className="px-4 py-3 text-slate-300 whitespace-nowrap">
												{a.acknowledgedByName ?? '—'}
											</td>
											<td className="px-4 py-3 text-slate-300 whitespace-nowrap">
												{a.resolvedAt
													? new Date(a.resolvedAt).toLocaleString()
													: '—'}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</MainLayout>
	);
}

function ExpiringSubscriptions({ users }: { users: AdminUserRow[] }) {
	// eslint-disable-next-line react-hooks/purity
	const now = Date.now();
	const rows = users
		.filter((u) => u.expiresAt !== null)
		.map((u) => {
			const ms = new Date(u.expiresAt as string).getTime();
			const days = Math.floor((ms - now) / (1000 * 60 * 60 * 24));
			return { ...u, daysLeft: days };
		})
		.filter((u) => u.daysLeft <= 30)
		.sort((a, b) => a.daysLeft - b.daysLeft);

	if (rows.length === 0) {
		return (
			<div className="rounded-xl border border-[var(--border)] p-8 text-center text-slate-500">
				No subscriptions expiring within 30 days.
			</div>
		);
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-[var(--border)]">
			<table className="min-w-full text-sm">
				<thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
					<tr>
						<th className="text-left px-4 py-2.5">Name</th>
						<th className="text-left px-4 py-2.5">Email</th>
						<th className="text-left px-4 py-2.5">Role</th>
						<th className="text-left px-4 py-2.5">Expires At</th>
						<th className="text-left px-4 py-2.5">Days Left</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((u) => {
						const critical = u.daysLeft <= 7;
						const rowCls = critical
							? 'border-t border-[var(--border)] bg-rose-500/5'
							: 'border-t border-[var(--border)] hover:bg-white/3';
						const daysCls = critical
							? 'text-rose-300 font-semibold'
							: 'text-amber-300 font-semibold';
						return (
							<tr key={u.id} className={rowCls}>
								<td className="px-4 py-3 font-semibold text-slate-100 whitespace-nowrap">
									{u.name}
								</td>
								<td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
									{u.email}
								</td>
								<td className="px-4 py-3 text-slate-200 uppercase text-[11px] tracking-wider">
									{u.role}
								</td>
								<td className="px-4 py-3 text-mono text-[12px] text-slate-300 whitespace-nowrap">
									{u.expiresAt
										? new Date(u.expiresAt).toLocaleDateString()
										: '—'}
								</td>
								<td className={`px-4 py-3 text-mono ${daysCls}`}>
									{u.daysLeft < 0
										? `${Math.abs(u.daysLeft)}d ago`
										: `${u.daysLeft}d`}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function TabButton({
	children,
	active,
	onClick,
}: {
	children: React.ReactNode;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
				active
					? 'border-cyan-400 text-cyan-300'
					: 'border-transparent text-slate-400 hover:text-slate-200'
			}`}>
			{children}
		</button>
	);
}
