'use client';

import { ErrorMessage, LoadingSpinner } from '@/components/Common';
import MainLayout from '@/components/MainLayout';
import SensorChart from '@/components/SensorChart';
import { useAllPondsReadings, usePonds } from '@/hooks/useApi';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
	const router = useRouter();
	const { isAuthenticated } = useAuthStore();
	const { ponds, isLoading, error } = usePonds();
	const [dateRange, setDateRange] = useState(7);
	const [customDate, setCustomDate] = useState({ from: '', to: '' });
	const [useCustomDate, setUseCustomDate] = useState(false);

	const sensorTypes = [
		{
			type: 'temperature',
			label: 'Temperature',
			color: '#22c55e',
			optimal: { min: 22, max: 27 },
		},
		{
			type: 'ph',
			label: 'pH Level',
			color: '#86efac',
			optimal: { min: 6.5, max: 7.5 },
		},
		{
			type: 'dox',
			label: 'Dissolved Oxygen',
			color: '#4ade80',
			optimal: { min: 5, max: 8 },
		},
		{
			type: 'salinity',
			label: 'Salinity',
			color: '#16a34a',
			optimal: { min: 15, max: 30 },
		},
		{
			type: 'humidity',
			label: 'Humidity',
			color: '#86efac',
			optimal: { min: 60, max: 85 },
		},
	];

	const { readings: tempReadings } = useAllPondsReadings(
		'temperature',
		dateRange,
	);
	const { readings: phReadings } = useAllPondsReadings('ph', dateRange);
	const { readings: doxReadings } = useAllPondsReadings('dox', dateRange);
	const { readings: salinityReadings } = useAllPondsReadings(
		'salinity',
		dateRange,
	);
	const { readings: humidityReadings } = useAllPondsReadings(
		'humidity',
		dateRange,
	);

	useEffect(() => {
		if (!isAuthenticated) {
			router.push('/login');
		}
	}, [isAuthenticated, router]);

	if (!isAuthenticated) return null;

	return (
		<MainLayout>
			<div className="space-y-8">
				<div>
					<h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
					<p className="text-gray-600 mt-2">
						Real-time monitoring across all ponds
					</p>
				</div>

				{error && <ErrorMessage message="Failed to load ponds" />}

				{isLoading ? (
					<LoadingSpinner />
				) : ponds && ponds.length > 0 ? (
					<>
						<div>
							<h2 className="text-2xl font-semibold text-gray-900 mb-4">
								Select Pond
							</h2>
							<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
								{ponds.map((pond) => (
									<Link
										key={pond.id}
										href={`/dashboard/${pond.id}`}
										className="p-4 border-2 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all cursor-pointer">
										<p className="font-semibold text-gray-900">{pond.name}</p>
										<p className="text-xs text-gray-600 mt-1">
											{pond.location}
										</p>
									</Link>
								))}
							</div>
						</div>

						<div>
							<h2 className="text-2xl font-semibold text-gray-900 mb-4">
								System Overview
							</h2>
							<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
								<div className="bg-white rounded-lg shadow p-6">
									<p className="text-gray-600 text-sm">Total Ponds</p>
									<p className="text-3xl font-bold text-green-600 mt-2">
										{ponds.length}
									</p>
								</div>
								<div className="bg-white rounded-lg shadow p-6">
									<p className="text-gray-600 text-sm">Active Sensors</p>
									<p className="text-3xl font-bold text-green-600 mt-2">
										{ponds.length * 5}
									</p>
								</div>
								<div className="bg-white rounded-lg shadow p-6">
									<p className="text-gray-600 text-sm">System Status</p>
									<p className="text-3xl font-bold text-green-600 mt-2">
										Healthy
									</p>
								</div>
								<div className="bg-white rounded-lg shadow p-6">
									<p className="text-gray-600 text-sm">Last Update</p>
									<p className="text-sm font-semibold text-gray-900 mt-2">
										{new Date().toLocaleTimeString()}
									</p>
								</div>
							</div>
						</div>

						<div>
							<h2 className="text-2xl font-semibold text-gray-900 mb-4">
								Sensor Trends (All Ponds)
							</h2>
							<div className="mb-4 flex gap-2 items-center flex-wrap">
								<button
									onClick={() => {
										setUseCustomDate(false);
										setDateRange(1);
									}}
									className={`px-4 py-2 rounded font-medium transition-colors ${
										!useCustomDate && dateRange === 1
											? 'bg-green-600 text-white'
											: 'bg-white text-gray-700 hover:bg-green-50'
									}`}>
									Today
								</button>
								{[7, 14, 30].map((days) => (
									<button
										key={days}
										onClick={() => {
											setUseCustomDate(false);
											setDateRange(days);
										}}
										className={`px-4 py-2 rounded font-medium transition-colors ${
											!useCustomDate && dateRange === days
												? 'bg-green-600 text-white'
												: 'bg-white text-gray-700 hover:bg-green-50'
										}`}>
										Last {days} days
									</button>
								))}
								<button
									onClick={() => setUseCustomDate(!useCustomDate)}
									className={`px-4 py-2 rounded font-medium transition-colors ${
										useCustomDate
											? 'bg-green-600 text-white'
											: 'bg-white text-gray-700 hover:bg-green-50'
									}`}>
									Custom Range
								</button>
							</div>
							{useCustomDate && (
								<div className="mb-4 flex gap-2 items-center">
									<input
										type="date"
										value={customDate.from}
										onChange={(e) =>
											setCustomDate({ ...customDate, from: e.target.value })
										}
										className="px-3 py-2 border border-gray-300 rounded text-gray-900"
									/>
									<span className="text-gray-600">to</span>
									<input
										type="date"
										value={customDate.to}
										onChange={(e) =>
											setCustomDate({ ...customDate, to: e.target.value })
										}
										className="px-3 py-2 border border-gray-300 rounded text-gray-900"
									/>
								</div>
							)}
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
								<SensorChart
									title="Temperature (Avg All Ponds)"
									data={tempReadings || []}
									color="#22c55e"
									optimalRange={sensorTypes[0].optimal}
								/>
								<SensorChart
									title="pH Level (Avg All Ponds)"
									data={phReadings || []}
									color="#86efac"
									optimalRange={sensorTypes[1].optimal}
								/>
								<SensorChart
									title="Dissolved Oxygen (Avg All Ponds)"
									data={doxReadings || []}
									color="#4ade80"
									optimalRange={sensorTypes[2].optimal}
								/>
								<SensorChart
									title="Salinity (Avg All Ponds)"
									data={salinityReadings || []}
									color="#16a34a"
									optimalRange={sensorTypes[3].optimal}
								/>
								<SensorChart
									title="Humidity (Avg All Ponds)"
									data={humidityReadings || []}
									color="#86efac"
									optimalRange={sensorTypes[4].optimal}
								/>
							</div>
						</div>
					</>
				) : (
					<ErrorMessage message="No ponds available" />
				)}
			</div>
		</MainLayout>
	);
}
