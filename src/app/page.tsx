'use client';

import { LoadingSpinner } from '@/components/Common';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
	const router = useRouter();
	const { status } = useSession();

	useEffect(() => {
		if (status === 'loading') return;
		if (status === 'authenticated') {
			router.replace('/dashboard');
		} else {
			router.replace('/login');
		}
	}, [status, router]);

	return (
		<div className="min-h-screen grid-bg flex items-center justify-center">
			<LoadingSpinner />
		</div>
	);
}
