import { User } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	logout: () => void;
	setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			isAuthenticated: false,

			logout: () => {
				set({ user: null, isAuthenticated: false });
			},

			setUser: (user) => {
				set({
					user,
					isAuthenticated: !!user,
				});
			},
		}),
		{
			name: 'auth-store',
		},
	),
);
