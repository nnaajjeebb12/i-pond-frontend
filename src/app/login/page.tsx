'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

interface LoginFormData {
	email: string;
	password: string;
}

const DEMO_ACCOUNTS = [
	{
		email: 'admin@soletronix.com',
		password: 'admin123',
		role: 'Admin',
		desc: 'Full access',
		accent: 'violet',
	},
	{
		email: 'owner1@ipond.com',
		password: 'owner123',
		role: 'Owner One',
		desc: 'Ponds 1-5',
		accent: 'cyan',
	},
	{
		email: 'owner2@ipond.com',
		password: 'owner123',
		role: 'Owner Two',
		desc: 'Ponds 6-10',
		accent: 'emerald',
	},
];

const ACCENT_MAP: Record<string, { dot: string; pill: string; border: string }> = {
	violet: {
		dot: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.7)]',
		pill: 'bg-violet-500/10 text-violet-300 border-violet-400/30',
		border: 'hover:border-violet-400/50',
	},
	cyan: {
		dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]',
		pill: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30',
		border: 'hover:border-cyan-400/50',
	},
	emerald: {
		dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]',
		pill: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30',
		border: 'hover:border-emerald-400/50',
	},
};

export default function LoginPage() {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');

	const {
		register,
		handleSubmit,
		formState: { errors },
		setValue,
	} = useForm<LoginFormData>({
		defaultValues: {
			email: 'admin@soletronix.com',
			password: 'admin123',
		},
	});

	const onSubmit = async (data: LoginFormData) => {
		setIsLoading(true);
		setError('');

		try {
			const res = await signIn('credentials', {
				email: data.email,
				password: data.password,
				redirect: false,
			});

			if (!res || res.error) {
				setError('Invalid email or password.');
				return;
			}

			router.push('/dashboard');
			router.refresh();
		} catch {
			setError('Login failed. Please try again.');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="relative min-h-screen overflow-hidden grid-bg flex items-center justify-center p-4">
			<div className="pointer-events-none absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-cyan-500/10 blur-3xl" />
			<div className="pointer-events-none absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-violet-500/10 blur-3xl" />
			<div className="pointer-events-none absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-emerald-500/8 blur-3xl" />

			<div className="relative w-full max-w-md">
				<div className="flex items-center justify-center gap-2 mb-6">
					<div className="relative w-11 h-11 rounded-xl bg-linear-to-br from-cyan-500/30 to-emerald-500/20 border border-cyan-400/40 flex items-center justify-center">
						<svg viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
							<path d="M12 2.5C8 8 5 11 5 14.5a7 7 0 0 0 14 0c0-3.5-3-6.5-7-12Z" />
						</svg>
						<span className="absolute -top-1 -right-1 live-dot" />
					</div>
					<div>
						<h1 className="text-2xl font-bold tracking-tight text-white">See ME</h1>
						<p className="text-[11px] text-slate-400 -mt-0.5 uppercase tracking-[0.18em]">
							Aquaculture Control
						</p>
					</div>
				</div>

				<div className="rounded-2xl border border-[var(--border)] bg-linear-to-b from-[rgba(20,28,51,0.8)] to-[rgba(10,15,31,0.9)] backdrop-blur-xl p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]">
					<div className="flex items-center gap-2 mb-6">
						<span className="live-dot" />
						<span className="text-[11px] font-semibold text-emerald-300 tracking-[0.16em] uppercase">
							Console Access
						</span>
					</div>

					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						{error && (
							<div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-sm flex items-start gap-2">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 mt-0.5 shrink-0">
									<circle cx="12" cy="12" r="10" />
									<line x1="12" y1="8" x2="12" y2="12" />
									<line x1="12" y1="16" x2="12.01" y2="16" />
								</svg>
								{error}
							</div>
						)}

						<div>
							<label
								htmlFor="email"
								className="block text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-400 mb-1.5">
								Email
							</label>
							<input
								id="email"
								type="email"
								{...register('email', {
									required: 'Email is required',
									pattern: {
										value: /^[^@]+@[^@]+\.[^@]+$/,
										message: 'Please enter a valid email',
									},
								})}
								className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 text-slate-100 placeholder:text-slate-500 transition-colors"
								placeholder="you@domain.com"
							/>
							{errors.email && (
								<p className="mt-1 text-xs text-rose-400">{errors.email.message}</p>
							)}
						</div>

						<div>
							<label
								htmlFor="password"
								className="block text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-400 mb-1.5">
								Password
							</label>
							<input
								id="password"
								type="password"
								{...register('password', { required: 'Password is required' })}
								className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 text-slate-100 placeholder:text-slate-500 transition-colors"
								placeholder="••••••••"
							/>
							{errors.password && (
								<p className="mt-1 text-xs text-rose-400">{errors.password.message}</p>
							)}
						</div>

						<button
							type="submit"
							disabled={isLoading}
							className="w-full mt-2 px-4 py-2.5 bg-linear-to-r from-cyan-500 to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 text-slate-950 font-semibold rounded-lg transition-all hover:shadow-[0_0_30px_-5px_rgba(34,211,238,0.5)] disabled:shadow-none">
							{isLoading ? 'Authenticating…' : 'Sign In →'}
						</button>
					</form>

					<div className="mt-7 pt-6 border-t border-white/5">
						<div className="flex items-center justify-between mb-3">
							<h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-400">
								Demo Accounts
							</h3>
							<span className="text-[10px] text-slate-500">click to autofill</span>
						</div>
						<div className="space-y-2">
							{DEMO_ACCOUNTS.map((account) => {
								const a = ACCENT_MAP[account.accent];
								return (
									<button
										key={account.email}
										type="button"
										onClick={() => {
											setValue('email', account.email);
											setValue('password', account.password);
										}}
										className={`w-full text-left p-3 border border-white/10 bg-white/3 rounded-lg ${a.border} hover:bg-white/5 transition-all cursor-pointer group`}>
										<div className="flex justify-between items-center gap-3">
											<div className="flex items-center gap-2.5 min-w-0">
												<span className={`w-2 h-2 rounded-full shrink-0 ${a.dot}`} />
												<div className="min-w-0">
													<p className="font-semibold text-slate-100 text-sm truncate">
														{account.role}
													</p>
													<p className="text-slate-400 text-[11px] font-mono truncate">
														{account.email}
													</p>
												</div>
											</div>
											<span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${a.pill} shrink-0 uppercase tracking-wider`}>
												{account.desc}
											</span>
										</div>
									</button>
								);
							})}
						</div>
					</div>
				</div>

				<p className="text-center text-[11px] text-slate-500 mt-6 font-mono">
					v1.0 • realtime IoT telemetry
				</p>
			</div>
		</div>
	);
}
