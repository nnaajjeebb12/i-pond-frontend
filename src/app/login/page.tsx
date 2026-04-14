'use client';

import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

interface LoginFormData {
	email: string;
	password: string;
}

export default function LoginPage() {
	const router = useRouter();
	const { login } = useAuthStore();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');

	const {
		register,
		handleSubmit,
		formState: { errors },
		setValue,
	} = useForm<LoginFormData>({
		defaultValues: {
			email: 'admin@ipond.com',
			password: 'password123',
		},
	});

	const onSubmit = async (data: LoginFormData) => {
		setIsLoading(true);
		setError('');

		try {
			await login(data.email, data.password);
			router.push('/dashboard');
		} catch (err) {
			setError('Login failed. Please try again.');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<div className="bg-white rounded-lg shadow-xl p-8">
					<h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
						i-Pond
					</h1>
					<p className="text-center text-gray-600 mb-8">
						Aquaculture Monitoring System
					</p>

					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						{error && (
							<div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
								{error}
							</div>
						)}

						<div>
							<label
								htmlFor="email"
								className="block text-sm font-medium text-gray-700 mb-1">
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
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
								placeholder="Enter your email"
							/>
							{errors.email && (
								<p className="mt-1 text-sm text-red-600">
									{errors.email.message}
								</p>
							)}
							<p className="mt-2 text-xs text-gray-500">
								Demo: admin@ipond.com
							</p>
						</div>

						<div>
							<label
								htmlFor="password"
								className="block text-sm font-medium text-gray-700 mb-1">
								Password
							</label>
							<input
								id="password"
								type="password"
								{...register('password', { required: 'Password is required' })}
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
								placeholder="Enter your password"
							/>
							{errors.password && (
								<p className="mt-1 text-sm text-red-600">
									{errors.password.message}
								</p>
							)}
							<p className="mt-2 text-xs text-gray-500">Demo: password123</p>
						</div>

						<button
							type="submit"
							disabled={isLoading}
							className="w-full mt-6 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors">
							{isLoading ? 'Logging in...' : 'Sign In'}
						</button>
					</form>

					<div className="mt-8 pt-8 border-t border-gray-200">
						<h3 className="text-sm font-semibold text-gray-900 mb-4">
							Demo Accounts (Password: password123)
						</h3>
						<div className="space-y-3">
							{[
								{
									email: 'admin@ipond.com',
									role: 'Admin',
									desc: 'Full access + User Management',
								},
								{
									email: 'operator1@ponds.com',
									role: 'Operator 1',
									desc: 'Ponds 1, 2, 3',
								},
								{
									email: 'operator2@ponds.com',
									role: 'Operator 2',
									desc: 'Ponds 4, 5, 6',
								},
								{
									email: 'viewer1@ponds.com',
									role: 'Viewer 1',
									desc: 'Views Operator 1 ponds',
								},
								{
									email: 'viewer2@ponds.com',
									role: 'Viewer 2',
									desc: 'Views Operator 2 ponds',
								},
							].map((account) => (
								<button
									key={account.email}
									type="button"
									onClick={() => {
										setValue('email', account.email);
										setValue('password', 'password123');
									}}
									className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
									<div className="flex justify-between items-start">
										<div>
											<p className="font-medium text-gray-900">
												{account.role}
											</p>
											<p className="text-gray-600 text-xs">{account.email}</p>
										</div>
										<span className="text-xs text-green-600 font-medium">
											{account.desc}
										</span>
									</div>
								</button>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
