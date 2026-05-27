'use client';

import MainLayout from '@/components/MainLayout';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';

type Role = 'admin' | 'owner' | 'viewer';

type AdminUser = {
	id: string;
	name: string;
	email: string;
	role: Role;
	createdAt: string | null;
	expiresAt: string | null;
	pondIds: string[];
};

function defaultExpiryDate(): string {
	const d = new Date();
	d.setFullYear(d.getFullYear() + 5);
	return d.toISOString().slice(0, 10);
}

function toDateInput(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toISOString().slice(0, 10);
}

function expiryBadgeCls(iso: string | null): {
	cls: string;
	label: string;
} {
	if (!iso) return { cls: 'text-slate-500', label: '—' };
	const days = Math.floor(
		(new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
	);
	const date = new Date(iso).toLocaleDateString();
	if (days < 0)
		return {
			cls: 'text-rose-300 font-semibold',
			label: `${date} (expired)`,
		};
	if (days <= 7)
		return {
			cls: 'text-rose-300 font-semibold',
			label: `${date} (${days}d)`,
		};
	if (days <= 30)
		return {
			cls: 'text-amber-300 font-semibold',
			label: `${date} (${days}d)`,
		};
	return { cls: 'text-emerald-300', label: date };
}

type AdminPond = {
	id: string;
	pond_code: string | null;
	name: string;
	location: string | null;
	company_name: string | null;
	capacity: number | null;
	area: number | null;
	users: { id: string; name: string; role: string }[];
};

const fetcher = async <T,>(url: string): Promise<T> => {
	const res = await fetch(url, { credentials: 'include' });
	if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
	return (await res.json()) as T;
};

const inputCls =
	'w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 text-slate-100 transition-colors';
const labelCls =
	'block text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-400 mb-1.5';
const btnPrimaryCls =
	'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-linear-to-r from-cyan-500 to-emerald-500 text-slate-950 font-semibold rounded-lg hover:shadow-[0_0_25px_-5px_rgba(34,211,238,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhostCls =
	'inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 font-medium rounded-lg transition-colors';

export default function AdminPage() {
	const { data: session } = useSession();
	const [activeTab, setActiveTab] = useState<'users' | 'ponds'>('users');

	const isAdmin = session?.user?.role === 'admin';

	if (!isAdmin) {
		return (
			<MainLayout>
				<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 backdrop-blur-sm">
					<h1 className="text-2xl font-bold text-rose-300 mb-2">Access Denied</h1>
					<p className="text-rose-200/80">Only administrators can access this page.</p>
				</div>
			</MainLayout>
		);
	}

	return (
		<MainLayout>
			<div className="space-y-8">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-violet-300">
							Admin Console
						</span>
					</div>
					<h1 className="text-4xl font-bold text-white tracking-tight">
						User & Pond Management
					</h1>
					<p className="text-slate-400 mt-1.5 text-sm">
						Manage system users and ponds
					</p>
				</div>

				<div className="rounded-xl border border-[var(--border)] bg-linear-to-br from-[rgba(20,28,51,0.85)] to-[rgba(15,23,42,0.85)] backdrop-blur-sm overflow-hidden">
					<div className="border-b border-white/5">
						<nav className="flex">
							<TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')}>
								Users
							</TabButton>
							<TabButton active={activeTab === 'ponds'} onClick={() => setActiveTab('ponds')}>
								Ponds
							</TabButton>
						</nav>
					</div>

					<div className="p-6">
						{activeTab === 'users' ? (
							<UsersTab selfId={session?.user?.id ?? ''} />
						) : (
							<PondsTab />
						)}
					</div>
				</div>
			</div>
		</MainLayout>
	);
}

// ============================================================================
// USERS TAB
// ============================================================================

function UsersTab({ selfId }: { selfId: string }) {
	const { data: users, mutate: mutateUsers } = useSWR<AdminUser[]>(
		'/api/admin/users',
		fetcher,
	);
	const { data: ponds } = useSWR<AdminPond[]>('/api/admin/ponds', fetcher);

	const [showAdd, setShowAdd] = useState(false);
	const [editUser, setEditUser] = useState<AdminUser | null>(null);
	const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<button onClick={() => setShowAdd(true)} className={btnPrimaryCls}>
					+ Add User
				</button>
			</div>

			<div className="overflow-x-auto rounded-lg border border-white/5">
				<table className="w-full text-sm">
					<thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
						<tr>
							<Th>Name</Th>
							<Th>Email</Th>
							<Th>Role</Th>
							<Th>Assigned Ponds</Th>
							<Th>Created</Th>
							<Th>Expires</Th>
							<Th className="text-right">Actions</Th>
						</tr>
					</thead>
					<tbody className="divide-y divide-white/5">
						{!users && (
							<tr>
								<td colSpan={7} className="px-4 py-6 text-center text-slate-500">
									Loading…
								</td>
							</tr>
						)}
						{users && users.length === 0 && (
							<tr>
								<td colSpan={7} className="px-4 py-6 text-center text-slate-500">
									No users yet.
								</td>
							</tr>
						)}
						{users?.map((u) => (
							<tr key={u.id} className="hover:bg-white/3">
								<Td className="font-semibold text-white">{u.name}</Td>
								<Td className="font-mono text-xs text-slate-300">{u.email}</Td>
								<Td>
									<RoleBadge role={u.role} />
								</Td>
								<Td>
									<div className="flex flex-wrap gap-1">
										{u.pondIds.length === 0 ? (
											<span className="text-slate-500 text-xs">—</span>
										) : (
											u.pondIds.map((pid) => {
												const p = ponds?.find((x) => x.id === pid);
												return (
													<span
														key={pid}
														className="px-2 py-0.5 bg-cyan-500/10 text-cyan-300 border border-cyan-400/25 rounded text-[11px] font-medium">
														{p?.pond_code ?? p?.name ?? pid}
													</span>
												);
											})
										)}
									</div>
								</Td>
								<Td className="text-slate-400 text-xs">
									{u.createdAt
										? new Date(u.createdAt).toLocaleDateString()
										: '—'}
								</Td>
								<Td className="text-xs">
									{(() => {
										const e = expiryBadgeCls(u.expiresAt);
										return <span className={e.cls}>{e.label}</span>;
									})()}
								</Td>
								<Td className="text-right">
									<div className="inline-flex gap-2">
										<button
											onClick={() => setEditUser(u)}
											className="px-3 py-1 text-xs rounded border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
											Edit
										</button>
										<button
											disabled={u.id === selfId}
											title={u.id === selfId ? 'Cannot delete yourself' : ''}
											onClick={() => setDeleteUser(u)}
											className="px-3 py-1 text-xs rounded border border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
											Delete
										</button>
									</div>
								</Td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{showAdd && (
				<UserModal
					mode="add"
					ponds={ponds ?? []}
					onClose={() => setShowAdd(false)}
					onSaved={() => {
						setShowAdd(false);
						mutateUsers();
					}}
				/>
			)}

			{editUser && (
				<UserModal
					mode="edit"
					user={editUser}
					ponds={ponds ?? []}
					onClose={() => setEditUser(null)}
					onSaved={() => {
						setEditUser(null);
						mutateUsers();
					}}
				/>
			)}

			{deleteUser && (
				<ConfirmModal
					title="Delete User?"
					message={`Are you sure you want to delete "${deleteUser.name}"? This cannot be undone.`}
					onCancel={() => setDeleteUser(null)}
					onConfirm={async () => {
						const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
							method: 'DELETE',
							credentials: 'include',
						});
						setDeleteUser(null);
						if (res.ok) mutateUsers();
						else alert('Delete failed.');
					}}
				/>
			)}
		</div>
	);
}

function UserModal({
	mode,
	user,
	ponds,
	onClose,
	onSaved,
}: {
	mode: 'add' | 'edit';
	user?: AdminUser;
	ponds: AdminPond[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const [name, setName] = useState(user?.name ?? '');
	const [email, setEmail] = useState(user?.email ?? '');
	const [password, setPassword] = useState('');
	const [showPw, setShowPw] = useState(false);
	const [role, setRole] = useState<Role>(user?.role ?? 'owner');
	const [pondIds, setPondIds] = useState<string[]>(user?.pondIds ?? []);
	const [pondSearch, setPondSearch] = useState('');
	const [expiresAt, setExpiresAt] = useState<string>(
		user ? toDateInput(user.expiresAt) : defaultExpiryDate(),
	);
	const [submitting, setSubmitting] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const filteredPonds = useMemo(() => {
		const q = pondSearch.toLowerCase();
		if (!q) return ponds;
		return ponds.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				(p.pond_code ?? '').toLowerCase().includes(q) ||
				(p.company_name ?? '').toLowerCase().includes(q),
		);
	}, [ponds, pondSearch]);

	const toggle = (id: string) =>
		setPondIds((cur) =>
			cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
		);

	const submit = async () => {
		setErr(null);
		setSubmitting(true);
		try {
			const body: Record<string, unknown> = {
				name,
				email,
				role,
				pondIds: pondIds.map((p) => Number(p)),
				expiresAt: expiresAt || null,
			};
			if (password) body.password = password;

			const url =
				mode === 'add' ? '/api/admin/users' : `/api/admin/users/${user!.id}`;
			const method = mode === 'add' ? 'POST' : 'PATCH';
			const res = await fetch(url, {
				method,
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				setErr(j.error ?? 'failed');
				setSubmitting(false);
				return;
			}
			onSaved();
		} catch {
			setErr('network_error');
			setSubmitting(false);
		}
	};

	return (
		<ModalShell title={mode === 'add' ? 'Add New User' : 'Edit User'} onClose={onClose}>
			<div className="space-y-4">
				<div>
					<label className={labelCls}>Name</label>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={inputCls}
						placeholder="Full name"
					/>
				</div>
				<div>
					<label className={labelCls}>Email</label>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className={inputCls}
						placeholder="user@domain.com"
					/>
				</div>
				<div>
					<label className={labelCls}>Password</label>
					<div className="relative">
						<input
							type={showPw ? 'text' : 'password'}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className={inputCls + ' pr-20'}
							placeholder={
								mode === 'edit' ? 'Leave blank to keep current password' : '••••••••'
							}
						/>
						<button
							type="button"
							onClick={() => setShowPw((v) => !v)}
							className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-cyan-300 hover:text-cyan-200">
							{showPw ? 'hide' : 'show'}
						</button>
					</div>
				</div>
				<div>
					<label className={labelCls}>Role</label>
					<select
						value={role}
						onChange={(e) => setRole(e.target.value as Role)}
						className={inputCls}>
						<option value="admin">Admin</option>
						<option value="owner">Owner</option>
						<option value="viewer">Viewer</option>
					</select>
				</div>
				<div>
					<label className={labelCls}>Subscription Expiry Date</label>
					<input
						type="date"
						value={expiresAt}
						onChange={(e) => setExpiresAt(e.target.value)}
						className={inputCls}
					/>
					<p className="mt-1 text-[10px] text-slate-500">
						Leave blank for no expiry. Default is today + 5 years.
					</p>
				</div>
				<div>
					<label className={labelCls}>Assign Ponds</label>
					<input
						value={pondSearch}
						onChange={(e) => setPondSearch(e.target.value)}
						placeholder="Search ponds…"
						className={inputCls + ' mb-2 text-sm'}
					/>
					<div className="space-y-1 max-h-56 overflow-y-auto rounded-lg bg-white/3 border border-white/10 p-3">
						{filteredPonds.length === 0 ? (
							<p className="text-slate-500 text-xs px-2 py-1">No ponds.</p>
						) : (
							filteredPonds.map((p) => (
								<label
									key={p.id}
									className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
									<input
										type="checkbox"
										checked={pondIds.includes(p.id)}
										onChange={() => toggle(p.id)}
										className="w-4 h-4 accent-cyan-500"
									/>
									<span className="text-slate-200 text-sm">
										<span className="font-mono text-cyan-300 mr-2">
											{p.pond_code ?? `#${p.id}`}
										</span>
										{p.name}
									</span>
								</label>
							))
						)}
					</div>
				</div>
				{err && (
					<p className="text-rose-300 text-sm bg-rose-500/10 border border-rose-400/30 rounded px-3 py-2">
						{err}
					</p>
				)}
			</div>
			<div className="flex gap-3 mt-6">
				<button onClick={onClose} className={btnGhostCls + ' flex-1'}>
					Cancel
				</button>
				<button
					disabled={submitting}
					onClick={submit}
					className={btnPrimaryCls + ' flex-1'}>
					{submitting ? 'Saving…' : 'Save'}
				</button>
			</div>
		</ModalShell>
	);
}

// ============================================================================
// PONDS TAB
// ============================================================================

function PondsTab() {
	const { data: ponds, mutate: mutatePonds } = useSWR<AdminPond[]>(
		'/api/admin/ponds',
		fetcher,
	);

	const [showAdd, setShowAdd] = useState(false);
	const [editPond, setEditPond] = useState<AdminPond | null>(null);
	const [deletePond, setDeletePond] = useState<AdminPond | null>(null);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<button onClick={() => setShowAdd(true)} className={btnPrimaryCls}>
					+ Add Pond
				</button>
			</div>

			<div className="overflow-x-auto rounded-lg border border-white/5">
				<table className="w-full text-sm">
					<thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
						<tr>
							<Th>Code</Th>
							<Th>Name</Th>
							<Th>Company</Th>
							<Th>Location</Th>
							<Th>Capacity</Th>
							<Th>Area</Th>
							<Th>Assigned Users</Th>
							<Th className="text-right">Actions</Th>
						</tr>
					</thead>
					<tbody className="divide-y divide-white/5">
						{!ponds && (
							<tr>
								<td colSpan={8} className="px-4 py-6 text-center text-slate-500">
									Loading…
								</td>
							</tr>
						)}
						{ponds && ponds.length === 0 && (
							<tr>
								<td colSpan={8} className="px-4 py-6 text-center text-slate-500">
									No ponds yet.
								</td>
							</tr>
						)}
						{ponds?.map((p) => (
							<tr key={p.id} className="hover:bg-white/3">
								<Td className="font-mono text-cyan-300">{p.pond_code ?? '—'}</Td>
								<Td className="font-semibold text-white">{p.name}</Td>
								<Td className="text-slate-300">{p.company_name ?? '—'}</Td>
								<Td className="text-slate-400">{p.location ?? '—'}</Td>
								<Td className="text-slate-300 font-mono text-xs">
									{p.capacity ?? '—'}
								</Td>
								<Td className="text-slate-300 font-mono text-xs">
									{p.area ?? '—'}
								</Td>
								<Td>
									<div className="flex flex-wrap gap-1">
										{p.users.length === 0 ? (
											<span className="text-slate-500 text-xs">—</span>
										) : (
											p.users.map((u) => (
												<span
													key={u.id}
													className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-400/25 rounded text-[11px] font-medium">
													{u.name}
												</span>
											))
										)}
									</div>
								</Td>
								<Td className="text-right">
									<div className="inline-flex gap-2">
										<button
											onClick={() => setEditPond(p)}
											className="px-3 py-1 text-xs rounded border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
											Edit
										</button>
										<button
											onClick={() => setDeletePond(p)}
											className="px-3 py-1 text-xs rounded border border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20">
											Delete
										</button>
									</div>
								</Td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{showAdd && (
				<PondModal
					mode="add"
					onClose={() => setShowAdd(false)}
					onSaved={() => {
						setShowAdd(false);
						mutatePonds();
					}}
				/>
			)}

			{editPond && (
				<PondModal
					mode="edit"
					pond={editPond}
					onClose={() => setEditPond(null)}
					onSaved={() => {
						setEditPond(null);
						mutatePonds();
					}}
				/>
			)}

			{deletePond && (
				<PondDeleteModal
					pond={deletePond}
					onCancel={() => setDeletePond(null)}
					onDeleted={() => {
						setDeletePond(null);
						mutatePonds();
					}}
				/>
			)}
		</div>
	);
}

function PondModal({
	mode,
	pond,
	onClose,
	onSaved,
}: {
	mode: 'add' | 'edit';
	pond?: AdminPond;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [pondCode, setPondCode] = useState(pond?.pond_code ?? '');
	const [name, setName] = useState(pond?.name ?? '');
	const [companyName, setCompanyName] = useState(pond?.company_name ?? '');
	const [location, setLocation] = useState(pond?.location ?? '');
	const [capacity, setCapacity] = useState(
		pond?.capacity != null ? String(pond.capacity) : '',
	);
	const [area, setArea] = useState(pond?.area != null ? String(pond.area) : '');
	const [submitting, setSubmitting] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		if (mode !== 'add') return;
		fetch('/api/admin/ponds/next-code', { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				if (j?.suggested) setPondCode((cur) => cur || j.suggested);
			})
			.catch(() => {});
	}, [mode]);

	const submit = async () => {
		setErr(null);
		setSubmitting(true);
		const body = {
			pond_code: pondCode,
			name,
			company_name: companyName || null,
			location: location || null,
			capacity: capacity === '' ? null : Number(capacity),
			area: area === '' ? null : Number(area),
		};
		const url = mode === 'add' ? '/api/admin/ponds' : `/api/admin/ponds/${pond!.id}`;
		const method = mode === 'add' ? 'POST' : 'PATCH';
		const res = await fetch(url, {
			method,
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			setErr(j.error ?? 'failed');
			setSubmitting(false);
			return;
		}
		onSaved();
	};

	return (
		<ModalShell title={mode === 'add' ? 'Add New Pond' : 'Edit Pond'} onClose={onClose}>
			<div className="space-y-4">
				<div>
					<label className={labelCls}>Pond Code</label>
					<input
						value={pondCode}
						onChange={(e) => setPondCode(e.target.value)}
						className={inputCls + ' font-mono'}
						placeholder="PND-001"
					/>
				</div>
				<div>
					<label className={labelCls}>Pond Name</label>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={inputCls}
						placeholder="Pond 1"
					/>
				</div>
				<div>
					<label className={labelCls}>Company Name</label>
					<input
						value={companyName}
						onChange={(e) => setCompanyName(e.target.value)}
						className={inputCls}
						placeholder="Soletronix Aquafarm"
					/>
				</div>
				<div>
					<label className={labelCls}>Location</label>
					<input
						value={location}
						onChange={(e) => setLocation(e.target.value)}
						className={inputCls}
						placeholder="North Section"
					/>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className={labelCls}>Capacity (m³)</label>
						<input
							type="number"
							value={capacity}
							onChange={(e) => setCapacity(e.target.value)}
							className={inputCls}
							placeholder="10000"
						/>
					</div>
					<div>
						<label className={labelCls}>Area (m²)</label>
						<input
							type="number"
							value={area}
							onChange={(e) => setArea(e.target.value)}
							className={inputCls}
							placeholder="250"
						/>
					</div>
				</div>
				{err && (
					<p className="text-rose-300 text-sm bg-rose-500/10 border border-rose-400/30 rounded px-3 py-2">
						{err}
					</p>
				)}
			</div>
			<div className="flex gap-3 mt-6">
				<button onClick={onClose} className={btnGhostCls + ' flex-1'}>
					Cancel
				</button>
				<button
					disabled={submitting}
					onClick={submit}
					className={btnPrimaryCls + ' flex-1'}>
					{submitting ? 'Saving…' : 'Save'}
				</button>
			</div>
		</ModalShell>
	);
}

function PondDeleteModal({
	pond,
	onCancel,
	onDeleted,
}: {
	pond: AdminPond;
	onCancel: () => void;
	onDeleted: () => void;
}) {
	const [stage, setStage] = useState<'confirm' | 'force'>('confirm');
	const [err, setErr] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const tryDelete = async (confirm: boolean) => {
		setBusy(true);
		setErr(null);
		const url = `/api/admin/ponds/${pond.id}${confirm ? '?confirm=true' : ''}`;
		const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
		setBusy(false);
		if (res.ok) {
			onDeleted();
			return;
		}
		const j = await res.json().catch(() => ({}));
		if (j?.error === 'pond_has_sensor_data') {
			setStage('force');
			return;
		}
		setErr(j?.error ?? 'delete_failed');
	};

	return (
		<ModalShell title="Delete Pond?" onClose={onCancel}>
			<p className="text-slate-300 text-sm">
				Delete <span className="font-mono text-cyan-300">{pond.pond_code}</span>{' '}
				<span className="text-white font-semibold">{pond.name}</span>?
			</p>
			{stage === 'force' && (
				<div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-amber-200 text-sm">
					This pond has sensor data. Deleting will also remove all readings. This
					cannot be undone.
				</div>
			)}
			{err && (
				<p className="mt-3 text-rose-300 text-sm bg-rose-500/10 border border-rose-400/30 rounded px-3 py-2">
					{err}
				</p>
			)}
			<div className="flex gap-3 mt-6">
				<button onClick={onCancel} className={btnGhostCls + ' flex-1'}>
					Cancel
				</button>
				<button
					disabled={busy}
					onClick={() => tryDelete(stage === 'force')}
					className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-linear-to-r from-rose-500 to-red-600 text-white font-semibold rounded-lg hover:shadow-[0_0_25px_-5px_rgba(244,63,94,0.6)] transition-all disabled:opacity-50">
					{busy ? 'Deleting…' : stage === 'force' ? 'Delete Anyway' : 'Delete'}
				</button>
			</div>
		</ModalShell>
	);
}

// ============================================================================
// SHARED
// ============================================================================

function ModalShell({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setTimeout(() => setMounted(true), 0);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prev;
		};
	}, [onClose]);

	if (!mounted) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				className="absolute inset-0 bg-black/70 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-linear-to-b from-[rgba(20,28,51,0.97)] to-[rgba(10,15,31,0.99)] backdrop-blur-xl p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between mb-5">
					<h2 className="text-[18px] font-bold text-white">{title}</h2>
					<button
						onClick={onClose}
						aria-label="Close"
						className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="w-4 h-4">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				{children}
			</div>
		</div>,
		document.body,
	);
}

function ConfirmModal({
	title,
	message,
	onCancel,
	onConfirm,
}: {
	title: string;
	message: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const [busy, setBusy] = useState(false);
	return (
		<ModalShell title={title} onClose={onCancel}>
			<p className="text-slate-300 text-sm">{message}</p>
			<div className="flex gap-3 mt-6">
				<button onClick={onCancel} className={btnGhostCls + ' flex-1'}>
					Cancel
				</button>
				<button
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						await onConfirm();
					}}
					className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-linear-to-r from-rose-500 to-red-600 text-white font-semibold rounded-lg hover:shadow-[0_0_25px_-5px_rgba(244,63,94,0.6)] transition-all disabled:opacity-50">
					{busy ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</ModalShell>
	);
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			className={`relative px-6 py-4 text-sm font-semibold transition-colors ${
				active ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200'
			}`}>
			{children}
			{active && (
				<span className="absolute bottom-0 left-3 right-3 h-[2px] bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
			)}
		</button>
	);
}

function RoleBadge({ role }: { role: Role }) {
	const cls =
		role === 'admin'
			? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30'
			: role === 'owner'
				? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30'
				: 'bg-amber-500/10 text-amber-300 border-amber-400/30';
	return (
		<span
			className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${cls}`}>
			{role}
		</span>
	);
}

function Th({
	children,
	className = '',
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<th className={`px-4 py-3 text-left font-semibold ${className}`}>{children}</th>
	);
}

function Td({
	children,
	className = '',
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
