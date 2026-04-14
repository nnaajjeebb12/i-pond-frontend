import { User } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	login: (email: string, password: string) => Promise<void>;
	logout: () => void;
	setUser: (user: User | null) => void;
}

const mockUsers: User[] = [
	{
		id: 'user-1',
		email: 'admin@ipond.com',
		name: 'Admin User',
		role: 'admin',
		createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
	},
	{
		id: 'operator-1',
		email: 'operator1@ponds.com',
		name: 'John Operator',
		role: 'operator',
		createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
		pondIds: ['pond-1', 'pond-2', 'pond-3'],
	},
	{
		id: 'operator-2',
		email: 'operator2@ponds.com',
		name: 'Jane Operator',
		role: 'operator',
		createdAt: Date.now() - 150 * 24 * 60 * 60 * 1000,
		pondIds: ['pond-4', 'pond-5', 'pond-6'],
	},
	{
		id: 'viewer-1',
		email: 'viewer1@ponds.com',
		name: 'Mike Viewer',
		role: 'viewer',
		createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
		operatorId: 'operator-1',
	},
	{
		id: 'viewer-2',
		email: 'viewer2@ponds.com',
		name: 'Sarah Viewer',
		role: 'viewer',
		createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
		operatorId: 'operator-2',
	},
];

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			isAuthenticated: false,

			login: async (email: string, password: string) => {
				const user = mockUsers.find((u) =>
					u.email.includes(email.split('@')[0]),
				);
				if (user) {
					set({ user, isAuthenticated: true });
				} else {
					set({
						user: {
							id: 'user-demo',
							email,
							name: email.split('@')[0],
							role: 'operator',
							createdAt: Date.now(),
						},
						isAuthenticated: true,
					});
				}
			},

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
