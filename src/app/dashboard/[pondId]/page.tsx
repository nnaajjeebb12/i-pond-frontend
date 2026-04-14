'use client';

import { BackButton, ErrorMessage, LoadingSpinner } from '@/components/Common';
import MainLayout from '@/components/MainLayout';
import SensorCard from '@/components/SensorCard';
import { useLatestReading, usePond } from '@/hooks/useApi';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';

interface PondDashboardProps {
	params: Promise<{ pondId: string }>;
}

const SENSOR_CONFIG = [
	{
		type: 'temperature',
		label: 'Temperature',
		icon: '🌡️',
		optimal: { min: 22, max: 27 },
	},
	{
		type: 'ph',
		label: 'pH Level',
		icon: '⚗️',
		optimal: { min: 6.5, max: 7.5 },
	},
	{
		type: 'dox',
		label: 'Dissolved Oxygen',
		icon: '💨',
		optimal: { min: 5, max: 8 },
	},
	{
		type: 'salinity',
		label: 'Salinity',
		icon: '🧂',
		optimal: { min: 15, max: 30 },
	},
	{
		type: 'humidity',
		label: 'Humidity',
		icon: '💧',
		optimal: { min: 60, max: 85 },
	},
];

export default function PondDashboardPage({ params }: PondDashboardProps) {
	const { pondId } = use(params);
	const router = useRouter();
	const { isAuthenticated } = useAuthStore();
	const { pond, isLoading: isPondLoading, error: pondError } = usePond(pondId);

	useEffect(() => {
		if (!isAuthenticated) router.push('/login');
	}, [isAuthenticated, router]);

	if (!isAuthenticated) return null;
	if (pondError)
		return (
			<MainLayout>
				<ErrorMessage message="Failed to load pond details" />
			</MainLayout>
		);
	if (isPondLoading)
		return (
			<MainLayout>
				<LoadingSpinner />
			</MainLayout>
		);
	if (!pond)
		return (
			<MainLayout>
				<ErrorMessage message="Pond not found" />
			</MainLayout>
		);

	return (
		<MainLayout>
			<div className="space-y-8">
				<div>
					<BackButton href="/dashboard" label="← Back to Ponds" />
					<h1 className="text-4xl font-bold text-gray-900 mt-4">{pond.name}</h1>
					<p className="text-gray-600 mt-2">{pond.location}</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div className="bg-white rounded-lg shadow p-6">
						<p className="text-gray-600 text-sm">Location</p>
						<p className="text-xl font-semibold text-gray-900 mt-2">
							{pond.location}
						</p>
					</div>
					<div className="bg-white rounded-lg shadow p-6">
						<p className="text-gray-600 text-sm">Capacity</p>
						<p className="text-xl font-semibold text-gray-900 mt-2">
							{(pond.capacity / 1000).toFixed(1)}k liters
						</p>
					</div>
					<div className="bg-white rounded-lg shadow p-6">
						<p className="text-gray-600 text-sm">Area</p>
						<p className="text-xl font-semibold text-gray-900 mt-2">
							{pond.area.toFixed(1)} m²
						</p>
					</div>
				</div>

				<div>
					<h2 className="text-2xl font-semibold text-gray-900 mb-4">
						Real-Time Sensors
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{SENSOR_CONFIG.map((sensor) => (
							<Link
								key={sensor.type}
								href={`/dashboard/${pondId}/${sensor.type}`}>
								<div className="cursor-pointer hover:shadow-lg transition-shadow">
									<SensorCardWithData
										pondId={pondId}
										sensorType={sensor.type}
										title={sensor.label}
										icon={sensor.icon}
										optimal={sensor.optimal}
									/>
								</div>
							</Link>
						))}
					</div>
				</div>
			</div>
		</MainLayout>
	);
}

function SensorCardWithData({
	pondId,
	sensorType,
	title,
	icon,
	optimal,
}: {
	pondId: string;
	sensorType: string;
	title: string;
	icon: string;
	optimal: { min: number; max: number };
}) {
	const { reading, isLoading } = useLatestReading(pondId, sensorType);
	return (
		<SensorCard
			title={title}
			reading={reading}
			icon={icon}
			optimal={optimal}
			isLoading={isLoading}
		/>
	);
}
