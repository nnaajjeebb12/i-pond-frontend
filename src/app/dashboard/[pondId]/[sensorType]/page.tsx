'use client';

import { BackButton, ErrorMessage, LoadingSpinner } from '@/components/Common';
import MainLayout from '@/components/MainLayout';
import SensorCard from '@/components/SensorCard';
import SensorChart from '@/components/SensorChart';
import { usePond, useSensorReadings } from '@/hooks/useApi';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

interface SensorDetailProps {
	params: Promise<{ pondId: string; sensorType: string }>;
}

const SENSOR_CONFIGS: Record<
	string,
	{
		label: string;
		icon: string;
		unit: string;
		optimal: { min: number; max: number };
		color: string;
	}
> = {
	temperature: {
		label: 'Temperature',
		icon: '🌡️',
		unit: '°C',
		optimal: { min: 22, max: 27 },
		color: '#22c55e',
	},
	ph: {
		label: 'pH Level',
		icon: '⚗️',
		unit: 'pH',
		optimal: { min: 6.5, max: 7.5 },
		color: '#86efac',
	},
	dox: {
		label: 'Dissolved Oxygen',
		icon: '💨',
		unit: 'mg/L',
		optimal: { min: 5, max: 8 },
		color: '#4ade80',
	},
	salinity: {
		label: 'Salinity',
		icon: '🧂',
		unit: 'ppt',
		optimal: { min: 15, max: 30 },
		color: '#16a34a',
	},
	humidity: {
		label: 'Humidity',
		icon: '💧',
		unit: '%',
		optimal: { min: 60, max: 85 },
		color: '#86efac',
	},
};

export default function SensorDetailPage({ params }: SensorDetailProps) {
	const { pondId, sensorType } = use(params);
	const router = useRouter();
	const { isAuthenticated } = useAuthStore();
	const { pond, isLoading: isPondLoading } = usePond(pondId);
	const [dateRange, setDateRange] = useState(7);
	const [customDate, setCustomDate] = useState({ from: '', to: '' });
	const [useCustomDate, setUseCustomDate] = useState(false);
	const {
		readings,
		isLoading: isReadingsLoading,
		error,
	} = useSensorReadings(pondId, sensorType, dateRange);

	useEffect(() => {
		if (!isAuthenticated) router.push('/login');
	}, [isAuthenticated, router]);

	if (!isAuthenticated) return null;

	const config = SENSOR_CONFIGS[sensorType];
	if (!config)
		return (
			<MainLayout>
				<ErrorMessage message="Sensor not found" />
			</MainLayout>
		);

	const latestReading = readings?.[readings.length - 1] || null;

	return (
		<MainLayout>
			<div className="space-y-8">
				<div>
					<BackButton
						href={`/dashboard/${pondId}`}
						label={`← Back to ${pond?.name || 'Pond'}`}
					/>
					<h1 className="text-4xl font-bold text-gray-900 mt-4">
						{config.label}
					</h1>
					<p className="text-gray-600 mt-2">
						{pond?.name} • {config.unit}
					</p>
				</div>

				<div className="flex gap-2 items-center flex-wrap">
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
					<div className="flex gap-2 items-center">
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

				{error && <ErrorMessage message="Failed to load sensor data" />}

				{isReadingsLoading || isPondLoading ? (
					<LoadingSpinner />
				) : (
					<>
						<div>
							<h2 className="text-2xl font-semibold text-gray-900 mb-4">
								Current Reading
							</h2>
							<SensorCard
								title={config.label}
								reading={latestReading}
								icon={config.icon}
								optimal={config.optimal}
								isLoading={isReadingsLoading}
							/>
						</div>

						{readings && readings.length > 0 && (
							<div>
								<h2 className="text-2xl font-semibold text-gray-900 mb-4">
									Statistics
								</h2>
								<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
									<div className="bg-white rounded-lg shadow p-6">
										<p className="text-gray-600 text-sm">Current</p>
										<p className="text-3xl font-bold text-green-600 mt-2">
											{latestReading?.value.toFixed(2) || 'N/A'} {config.unit}
										</p>
									</div>
									<div className="bg-white rounded-lg shadow p-6">
										<p className="text-gray-600 text-sm">Average</p>
										<p className="text-3xl font-bold text-green-700 mt-2">
											{(
												readings.reduce((sum, r) => sum + r.value, 0) /
												readings.length
											).toFixed(2)}{' '}
											{config.unit}
										</p>
									</div>
									<div className="bg-white rounded-lg shadow p-6">
										<p className="text-gray-600 text-sm">Maximum</p>
										<p className="text-3xl font-bold text-red-600 mt-2">
											{Math.max(...readings.map((r) => r.value)).toFixed(2)}{' '}
											{config.unit}
										</p>
									</div>
									<div className="bg-white rounded-lg shadow p-6">
										<p className="text-gray-600 text-sm">Minimum</p>
										<p className="text-3xl font-bold text-orange-600 mt-2">
											{Math.min(...readings.map((r) => r.value)).toFixed(2)}{' '}
											{config.unit}
										</p>
									</div>
								</div>
							</div>
						)}

						{readings && readings.length > 0 && (
							<div>
								<h2 className="text-2xl font-semibold text-gray-900 mb-4">
									Trend Analysis
								</h2>
								<SensorChart
									title={`${config.label} Over Time`}
									data={readings}
									color={config.color}
									isLoading={isReadingsLoading}
									optimalRange={config.optimal}
								/>
							</div>
						)}

						{readings && readings.length > 0 && (
							<div>
								<h2 className="text-2xl font-semibold text-gray-900 mb-4">
									Recent Readings
								</h2>
								<div className="bg-white rounded-lg shadow overflow-x-auto">
									<table className="w-full">
										<thead className="bg-gray-50">
											<tr>
												<th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
													Time
												</th>
												<th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
													Value
												</th>
												<th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
													Status
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-gray-200">
											{readings
												.slice(-20)
												.reverse()
												.map((reading, idx) => {
													const isOptimal =
														reading.value >= config.optimal.min &&
														reading.value <= config.optimal.max;
													return (
														<tr key={idx} className="hover:bg-gray-50">
															<td className="px-6 py-4 text-sm text-gray-900">
																{new Date(reading.timestamp).toLocaleString()}
															</td>
															<td className="px-6 py-4 text-sm text-gray-900 font-semibold">
																{reading.value.toFixed(2)} {config.unit}
															</td>
															<td className="px-6 py-4 text-sm">
																<span
																	className={`px-3 py-1 rounded-full text-xs font-semibold ${isOptimal ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
																	{isOptimal ? 'Optimal' : 'Alert'}
																</span>
															</td>
														</tr>
													);
												})}
										</tbody>
									</table>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</MainLayout>
	);
}
