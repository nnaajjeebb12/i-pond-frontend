import { SensorReading } from '@/types';
import React from 'react';
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ReferenceArea,
	ResponsiveContainer,
	Tooltip,
	TooltipProps,
	XAxis,
	YAxis,
} from 'recharts';

interface SensorChartProps {
	title: string;
	data: SensorReading[];
	color?: string;
	isLoading?: boolean;
	optimalRange?: { min: number; max: number };
}

export default function SensorChart({
	title,
	data,
	color = '#3b82f6',
	isLoading,
	optimalRange,
}: SensorChartProps) {
	if (isLoading) {
		return (
			<div className="bg-white rounded-lg p-6 h-96">
				<h3 className="text-lg font-semibold mb-4">{title}</h3>
				<div className="h-64 bg-gray-200 rounded animate-pulse " />
			</div>
		);
	}

	const CustomTooltip = ({ active, payload }: any) => {
		if (active && payload && payload[0]) {
			const value = payload[0].value as number;
			const fullDate = payload[0].payload.fullDate;

			let statusColor = '#22c55e';
			let statusText = 'Optimal';

			if (optimalRange) {
				if (value < optimalRange.min || value > optimalRange.max) {
					const warningThreshold = optimalRange.min * 0.9;
					const criticalThreshold = optimalRange.min * 0.8;
					const warningHigh = optimalRange.max * 1.1;
					const criticalHigh = optimalRange.max * 1.2;

					if (value < criticalThreshold || value > criticalHigh) {
						statusColor = '#ef4444';
						statusText = 'Critical';
					} else if (value < warningThreshold || value > warningHigh) {
						statusColor = '#f59e0b';
						statusText = 'Warning';
					} else {
						statusColor = '#ef4444';
						statusText = 'Alert';
					}
				}
			}

			return (
				<div
					style={{
						backgroundColor: '#fff',
						border: `2px solid ${statusColor}`,
						borderRadius: '8px',
						padding: '10px 14px',
						boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
					}}>
					<p style={{ color: '#000', fontWeight: 600, margin: '0 0 6px 0' }}>
						{fullDate}
					</p>
					<p
						style={{
							color: statusColor,
							fontWeight: 700,
							margin: '0 0 4px 0',
							fontSize: '16px',
						}}>
						{value.toFixed(2)} {payload[0].unit || ''}
					</p>
					<p
						style={{
							color: statusColor,
							fontWeight: 600,
							margin: 0,
							fontSize: '12px',
						}}>
						Status: {statusText}
					</p>
				</div>
			);
		}
		return null;
	};

	const chartData = data.map((reading) => ({
		time: new Date(reading.timestamp).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
		}),
		date: new Date(reading.timestamp).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
		}),
		fullDate: new Date(reading.timestamp).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}),
		value: reading.value,
		timestamp: reading.timestamp,
	}));

	return (
		<div className="bg-white rounded-lg shadow p-6">
			<h3 className="text-lg text-gray-900 font-semibold mb-4">{title}</h3>
			<ResponsiveContainer width="100%" height={300}>
				<LineChart data={chartData}>
					<CartesianGrid strokeDasharray="3 3" />
					<XAxis
						dataKey="time"
						tick={{ fontSize: 12 }}
						interval={Math.floor(chartData.length / 8)}
					/>
					<YAxis />
					{optimalRange && (
						<ReferenceArea
							y1={optimalRange.min}
							y2={optimalRange.max}
							fill="#22c55e"
							fillOpacity={0.1}
							stroke="#22c55e"
							strokeOpacity={0.3}
						/>
					)}
					<Tooltip content={<CustomTooltip />} />
					<Legend />
					<Line
						type="monotone"
						dataKey="value"
						stroke={color}
						dot={false}
						name={title}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
