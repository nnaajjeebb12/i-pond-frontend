'use client';

import MainLayout from '@/components/MainLayout';
import { generateMockPonds } from '@/mocks/mockData';
import { useAuthStore } from '@/store/authStore';
import { User } from '@/types';
import { useState } from 'react';

export default function AdminPage() {
	const { user } = useAuthStore();
	const [activeTab, setActiveTab] = useState<'operators' | 'viewers'>(
		'operators',
	);
	const [operators, setOperators] = useState<User[]>([
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
	]);
	const [viewers, setViewers] = useState<User[]>([
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
	]);
	const [showAddModal, setShowAddModal] = useState(false);
	const [newUser, setNewUser] = useState({
		name: '',
		email: '',
		password: '',
		role: 'operator' as 'operator' | 'viewer',
		pondIds: [] as string[],
		operatorId: '',
	});
	const ponds = generateMockPonds(10);

	const handleAddUser = () => {
		const id = `${newUser.role}-${Date.now()}`;
		const user: User = {
			id,
			name: newUser.name,
			email: newUser.email,
			role: newUser.role,
			createdAt: Date.now(),
			...(newUser.role === 'operator'
				? { pondIds: newUser.pondIds }
				: { operatorId: newUser.operatorId }),
		};

		if (newUser.role === 'operator') {
			setOperators([...operators, user]);
		} else {
			setViewers([...viewers, user]);
		}

		setNewUser({
			name: '',
			email: '',
			password: '',
			role: 'operator',
			pondIds: [],
			operatorId: '',
		});
		setShowAddModal(false);
	};

	const togglePond = (pondId: string) => {
		if (newUser.pondIds.includes(pondId)) {
			setNewUser({
				...newUser,
				pondIds: newUser.pondIds.filter((id) => id !== pondId),
			});
		} else {
			setNewUser({ ...newUser, pondIds: [...newUser.pondIds, pondId] });
		}
	};

	if (user?.role !== 'admin') {
		return (
			<MainLayout>
				<div className="flex-1 p-8">
					<div className="bg-red-50 border border-red-200 rounded-lg p-6">
						<h1 className="text-2xl font-bold text-red-800">Access Denied</h1>
						<p className="text-red-600 mt-2">
							Only administrators can access this page.
						</p>
					</div>
				</div>
			</MainLayout>
		);
	}

	return (
		<MainLayout>
			<div className="flex-1 p-8 overflow-auto">
				<div className="max-w-6xl mx-auto">
					<div className="flex justify-between items-center mb-8">
						<div>
							<h1 className="text-4xl font-bold text-gray-900">
								User Management
							</h1>
							<p className="text-gray-600 mt-2">Manage operators and viewers</p>
						</div>
						<button
							onClick={() => setShowAddModal(true)}
							className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors">
							+ Add User
						</button>
					</div>

					<div className="bg-white rounded-lg shadow">
						<div className="border-b border-gray-200">
							<nav className="flex -mb-px">
								<button
									onClick={() => setActiveTab('operators')}
									className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
										activeTab === 'operators'
											? 'border-green-600 text-green-600'
											: 'border-transparent text-gray-500 hover:text-gray-700'
									}`}>
									Operators ({operators.length})
								</button>
								<button
									onClick={() => setActiveTab('viewers')}
									className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
										activeTab === 'viewers'
											? 'border-green-600 text-green-600'
											: 'border-transparent text-gray-500 hover:text-gray-700'
									}`}>
									Viewers ({viewers.length})
								</button>
							</nav>
						</div>

						<div className="p-6">
							{activeTab === 'operators' && (
								<div className="space-y-4">
									{operators.map((operator) => (
										<div
											key={operator.id}
											className="border border-gray-200 rounded-lg p-6">
											<div className="flex justify-between items-start">
												<div>
													<h3 className="text-xl font-semibold text-gray-900">
														{operator.name}
													</h3>
													<p className="text-gray-600">{operator.email}</p>
												</div>
												<span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
													Operator
												</span>
											</div>
											<div className="mt-4">
												<p className="text-sm font-medium text-gray-900 mb-2">
													Assigned Ponds:
												</p>
												<div className="flex flex-wrap gap-2">
													{operator.pondIds?.map((pondId) => {
														const pond = ponds.find((p) => p.id === pondId);
														return (
															<span
																key={pondId}
																className="px-3 py-1 bg-green-50 text-green-700 rounded text-sm">
																{pond?.name || pondId}
															</span>
														);
													})}
												</div>
											</div>
										</div>
									))}
								</div>
							)}

							{activeTab === 'viewers' && (
								<div className="space-y-4">
									{viewers.map((viewer) => {
										const operator = operators.find(
											(op) => op.id === viewer.operatorId,
										);
										return (
											<div
												key={viewer.id}
												className="border border-gray-200 rounded-lg p-6">
												<div className="flex justify-between items-start">
													<div>
														<h3 className="text-xl font-semibold text-gray-900">
															{viewer.name}
														</h3>
														<p className="text-gray-600">{viewer.email}</p>
													</div>
													<span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
														Viewer
													</span>
												</div>
												<div className="mt-4">
													<p className="text-sm font-medium text-gray-900">
														Assigned to:{' '}
														<span className="text-green-700 font-semibold">
															{operator?.name || 'N/A'}
														</span>
													</p>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{showAddModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
						<h2 className="text-2xl font-bold text-gray-900 mb-6">
							Add New User
						</h2>

						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-900 mb-2">
									Role
								</label>
								<select
									value={newUser.role}
									onChange={(e) =>
										setNewUser({
											...newUser,
											role: e.target.value as 'operator' | 'viewer',
										})
									}
									className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900">
									<option value="operator">Operator</option>
									<option value="viewer">Viewer</option>
								</select>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-900 mb-2">
									Name
								</label>
								<input
									type="text"
									value={newUser.name}
									onChange={(e) =>
										setNewUser({ ...newUser, name: e.target.value })
									}
									className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
									placeholder="Enter name"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-900 mb-2">
									Email
								</label>
								<input
									type="email"
									value={newUser.email}
									onChange={(e) =>
										setNewUser({ ...newUser, email: e.target.value })
									}
									className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
									placeholder="Enter email"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-900 mb-2">
									Password
								</label>
								<input
									type="password"
									value={newUser.password}
									onChange={(e) =>
										setNewUser({ ...newUser, password: e.target.value })
									}
									className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
									placeholder="Enter password"
								/>
							</div>

							{newUser.role === 'operator' && (
								<div>
									<label className="block text-sm font-medium text-gray-900 mb-2">
										Assign Ponds
									</label>
									<div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
										{ponds.map((pond) => (
											<label
												key={pond.id}
												className="flex items-center gap-2 cursor-pointer">
												<input
													type="checkbox"
													checked={newUser.pondIds.includes(pond.id)}
													onChange={() => togglePond(pond.id)}
													className="w-4 h-4 text-green-600"
												/>
												<span className="text-gray-900">{pond.name}</span>
											</label>
										))}
									</div>
								</div>
							)}

							{newUser.role === 'viewer' && (
								<div>
									<label className="block text-sm font-medium text-gray-900 mb-2">
										Assign to Operator
									</label>
									<select
										value={newUser.operatorId}
										onChange={(e) =>
											setNewUser({ ...newUser, operatorId: e.target.value })
										}
										className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900">
										<option value="">Select operator</option>
										{operators.map((op) => (
											<option key={op.id} value={op.id}>
												{op.name}
											</option>
										))}
									</select>
								</div>
							)}
						</div>

						<div className="flex gap-3 mt-6">
							<button
								onClick={() => setShowAddModal(false)}
								className="flex-1 px-4 py-2 border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50">
								Cancel
							</button>
							<button
								onClick={handleAddUser}
								className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
								Add User
							</button>
						</div>
					</div>
				</div>
			)}
		</MainLayout>
	);
}
