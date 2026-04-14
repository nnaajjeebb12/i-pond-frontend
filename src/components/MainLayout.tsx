import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { ReactNode } from 'react';

interface LayoutProps {
	children: ReactNode;
}

export default function MainLayout({ children }: LayoutProps) {
	const pathname = usePathname();
	const router = useRouter();
	const { user, logout } = useAuthStore();

	if (pathname === '/login') {
		return <>{children}</>;
	}

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard' },
		...(user?.role !== 'viewer'
			? [{ href: '/reports', label: 'Reports' }]
			: []),
		...(user?.role === 'admin'
			? [{ href: '/admin', label: 'User Management' }]
			: []),
	];

	return (
		<div className="flex h-screen bg-gray-100">
			<aside className="w-64 bg-gray-900 text-white shadow-lg">
				<div className="p-6">
					<h1 className="text-2xl font-bold">i-Pond</h1>
					<p className="text-gray-400 text-sm mt-1">Aquaculture Monitor</p>
				</div>
				<nav className="mt-8">
					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className={`block px-6 py-3 transition-colors ${
								pathname === item.href
									? 'bg-green-600 text-white'
									: 'text-gray-300 hover:bg-gray-800'
							}`}>
							{item.label}
						</Link>
					))}
				</nav>
				<div className="absolute bottom-0 w-64 border-t border-gray-700">
					<div className="p-6">
						<p className="text-sm text-gray-400">Logged in as:</p>
						<p className="font-semibold text-white mt-1">{user?.name}</p>
						<p className="text-xs text-gray-500">{user?.email}</p>
						<button
							onClick={() => {
								logout();
								router.push('/login');
							}}
							className="mt-4 w-full px-4 py-2 bg-green-700 hover:bg-green-800 rounded text-sm font-medium transition-colors">
							Logout
						</button>
					</div>
				</div>
			</aside>
			<main className="flex-1 overflow-auto">
				<div className="p-8">{children}</div>
			</main>
		</div>
	);
}
