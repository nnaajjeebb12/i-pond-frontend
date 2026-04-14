'use client';

import { LoadingSpinner } from '@/components/Common';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
	const router = useRouter();
	const { isAuthenticated } = useAuthStore();

	useEffect(() => {
		if (isAuthenticated) {
			router.push('/dashboard');
		} else {
			router.push('/login');
		}
	}, [isAuthenticated, router]);

	return (
		<div className="min-h-screen flex items-center justify-center">
			<LoadingSpinner />
		</div>
	);
}
