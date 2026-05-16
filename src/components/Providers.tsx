'use client';

import AlertPopup from '@/components/AlertPopup';
import { useAuthStore } from '@/store/authStore';
import { SessionProvider, useSession } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { ReactNode, useEffect } from 'react';

function SessionSync() {
	const { data: session, status } = useSession();
	const setUser = useAuthStore((s) => s.setUser);

	useEffect(() => {
		if (status === 'loading') return;

		if (session?.user) {
			setUser({
				id: session.user.id,
				email: session.user.email ?? '',
				name: session.user.name ?? '',
				role: session.user.role,
				createdAt: Date.now(),
			});
		} else {
			setUser(null);
		}
	}, [session, status, setUser]);

	return null;
}

export default function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider
			attribute="data-theme"
			defaultTheme="dark"
			enableSystem={false}
			storageKey="theme">
			<SessionProvider>
				<SessionSync />
				{children}
				<AlertPopup />
			</SessionProvider>
		</ThemeProvider>
	);
}
