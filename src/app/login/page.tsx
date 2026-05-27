'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

interface LoginFormData {
	email: string;
	password: string;
}

export default function LoginPage() {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');
	const [expired, setExpired] = useState(false);
	const [rememberMe, setRememberMe] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<LoginFormData>();

	const onSubmit = async (data: LoginFormData) => {
		setIsLoading(true);
		setError('');

		try {
			const pre = await fetch('/api/auth/precheck', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: data.email, password: data.password }),
			});
			const preBody = (await pre.json().catch(() => ({}))) as { result?: string };

			if (preBody.result === 'expired') {
				setExpired(true);
				return;
			}
			if (preBody.result !== 'ok') {
				setError('Invalid email or password.');
				return;
			}

			const res = await signIn('credentials', {
				email: data.email,
				password: data.password,
				rememberMe: rememberMe ? 'true' : 'false',
				redirect: false,
			});

			if (!res || res.error) {
				setError('Invalid email or password.');
				return;
			}

			await fetch('/api/auth/remember', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rememberMe }),
			}).catch(() => {});

			router.push('/dashboard');
			router.refresh();
		} catch {
			setError('Login failed. Please try again.');
		} finally {
			setIsLoading(false);
		}
	};

	if (expired) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen p-4 grid-bg">
				<div className="text-center p-8 rounded-xl border border-rose-500/30 bg-rose-500/10 max-w-md">
					<h2 className="text-2xl font-bold text-rose-400 mb-2">Subscription Expired</h2>
					<p className="text-slate-300 mb-4">
						Your account access has expired. Please contact Soletronix to renew.
					</p>
					<a
						href="mailto:sales@soletronix.com"
						className="text-cyan-400 underline">
						sales@soletronix.com
					</a>
					<div className="mt-6">
						<button
							onClick={() => setExpired(false)}
							className="text-xs text-slate-400 hover:text-slate-200">
							← Back to login
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="relative min-h-screen overflow-hidden grid-bg flex items-center justify-center p-4">
			<div className="pointer-events-none absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-cyan-500/10 blur-3xl" />
			<div className="pointer-events-none absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-violet-500/10 blur-3xl" />
			<div className="pointer-events-none absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-emerald-500/8 blur-3xl" />

			<div className="relative w-full max-w-md">
				<div className="flex items-center justify-center gap-2 mb-6">
					<div className="relative w-11 h-11 rounded-xl bg-linear-to-br from-cyan-500/30 to-emerald-500/20 border border-cyan-400/40 flex items-center justify-center">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="#22d3ee"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="w-5 h-5">
							<path d="M12 2.5C8 8 5 11 5 14.5a7 7 0 0 0 14 0c0-3.5-3-6.5-7-12Z" />
						</svg>
						<span className="absolute -top-1 -right-1 live-dot" />
					</div>
					<div>
						<h1 className="text-2xl font-bold tracking-tight text-white">
							See ME
						</h1>
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
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									className="w-4 h-4 mt-0.5 shrink-0">
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
								<p className="mt-1 text-xs text-rose-400">
									{errors.email.message}
								</p>
							)}
						</div>

						<div>
							<label
								htmlFor="password"
								className="block text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-400 mb-1.5">
								Password
							</label>
							<div className="relative">
								<input
									id="password"
									type={showPassword ? 'text' : 'password'}
									{...register('password', {
										required: 'Password is required',
									})}
									className="w-full px-4 py-2.5 pr-11 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 text-slate-100 placeholder:text-slate-500 transition-colors"
									placeholder="••••••••"
								/>
								<button
									type="button"
									onClick={() => setShowPassword((v) => !v)}
									aria-label={showPassword ? 'Hide password' : 'Show password'}
									aria-pressed={showPassword}
									className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors">
									{showPassword ? (
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
											className="w-4 h-4">
											<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 5.06-5.94" />
											<path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.6 19.6 0 0 1-3.17 4.19" />
											<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
											<line x1="1" y1="1" x2="23" y2="23" />
										</svg>
									) : (
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
											className="w-4 h-4">
											<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
											<circle cx="12" cy="12" r="3" />
										</svg>
									)}
								</button>
							</div>
							{errors.password && (
								<p className="mt-1 text-xs text-rose-400">
									{errors.password.message}
								</p>
							)}
						</div>

						{/* <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
							<input
								type="checkbox"
								checked={rememberMe}
								onChange={(e) => setRememberMe(e.target.checked)}
								className="w-4 h-4 accent-cyan-500 rounded"
							/>
							<span className="text-slate-300">Remember me for 30 days</span>
						</label> */}

						<button
							type="submit"
							disabled={isLoading}
							className="w-full mt-2 px-4 py-2.5 bg-linear-to-r from-cyan-500 to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 text-slate-950 font-semibold rounded-lg transition-all hover:shadow-[0_0_30px_-5px_rgba(34,211,238,0.5)] disabled:shadow-none">
							{isLoading ? 'Authenticating…' : 'Sign In →'}
						</button>
					</form>
				</div>

				<p className="text-center text-[11px] text-slate-500 mt-6 font-mono">
					v1.0 • realtime IoT telemetry
				</p>
			</div>
		</div>
	);
}
