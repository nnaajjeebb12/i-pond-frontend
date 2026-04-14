import { SensorReading } from '@/types';
import React from 'react';

interface SensorCardProps {
	title: string;
	reading: SensorReading | null;
	icon: React.ReactNode;
	optimal?: { min: number; max: number };
	isLoading?: boolean;
}

export default function SensorCard({
	title,
	reading,
	icon,
	optimal,
	isLoading,
}: SensorCardProps) {
	const getStatusColor = () => {
		if (!reading) return 'gray';
		if (!optimal) return 'blue';
		if (reading.value < optimal.min || reading.value > optimal.max)
			return 'red';
		return 'green';
	};

	const statusColor = getStatusColor();
	const colorClasses = {
		gray: 'bg-gray-50 border-gray-200',
		blue: 'bg-green-50 border-green-200',
		green: 'bg-green-50 border-green-200',
		red: 'bg-red-50 border-red-200',
	};

	const textClasses = {
		gray: 'text-gray-700',
		blue: 'text-green-700',
		green: 'text-green-700',
		red: 'text-red-700',
	};

	return (
		<div
			className={`rounded-lg border-2 p-6 transition-all ${colorClasses[statusColor as keyof typeof colorClasses]}`}>
			<div className="flex items-start justify-between">
				<div className="flex-1">
					<p className="text-gray-600 text-sm font-medium">{title}</p>
					{isLoading ? (
						<div className="mt-2 h-10 bg-gray-300 rounded animate-pulse" />
					) : reading ? (
						<p
							className={`text-4xl font-bold mt-2 ${textClasses[statusColor as keyof typeof textClasses]}`}>
							{reading.value}
							<span className="text-2xl">{reading.unit}</span>
						</p>
					) : (
						<p className="text-gray-500 text-2xl mt-2">N/A</p>
					)}
					{optimal && (
						<p className="text-xs text-gray-600 mt-2">
							Optimal: {optimal.min} - {optimal.max} {reading?.unit}
						</p>
					)}
				</div>
				<div className="text-4xl opacity-20">{icon}</div>
			</div>
			{reading && (
				<p className="text-xs text-gray-500 mt-4">
					Last updated: {new Date(reading.timestamp).toLocaleTimeString()}
				</p>
			)}
		</div>
	);
}
