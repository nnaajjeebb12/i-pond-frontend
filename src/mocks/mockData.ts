import { DashboardData, Pond, SensorReading, User } from '@/types';

export type { DashboardData, Pond, SensorReading, User };

const pondsCache: Pond[] = [];
export const readingsCache: Record<string, SensorReading[]> = {};

function generateSensorReadings(
	pondId: string,
	sensorType: string,
	count: number = 50,
): SensorReading[] {
	const readings: SensorReading[] = [];
	const now = Date.now();
	const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
	const timeRange = now - sevenDaysAgo;
	const interval = timeRange / count;

	const ranges: Record<
		string,
		{
			min: number;
			max: number;
			unit: string;
			optimalMin: number;
			optimalMax: number;
		}
	> = {
		temperature: {
			min: 18,
			max: 32,
			unit: '°C',
			optimalMin: 22,
			optimalMax: 27,
		},
		ph: { min: 5.5, max: 8.5, unit: 'pH', optimalMin: 6.5, optimalMax: 7.5 },
		dox: { min: 3, max: 11, unit: 'mg/L', optimalMin: 5, optimalMax: 8 },
		salinity: { min: 5, max: 40, unit: 'ppt', optimalMin: 15, optimalMax: 30 },
		humidity: { min: 50, max: 100, unit: '%', optimalMin: 60, optimalMax: 85 },
	};

	const range = ranges[sensorType] || {
		min: 0,
		max: 100,
		unit: 'U',
		optimalMin: 30,
		optimalMax: 70,
	};

	for (let i = count - 1; i >= 0; i--) {
		let value: number;
		const rand = Math.random();

		if (rand < 0.6) {
			const baseValue = (range.optimalMin + range.optimalMax) / 2;
			const variance =
				(Math.random() - 0.5) * (range.optimalMax - range.optimalMin) * 0.4;
			value = baseValue + variance;
		} else if (rand < 0.85) {
			if (Math.random() > 0.5) {
				value =
					range.optimalMax +
					Math.random() * (range.max - range.optimalMax) * 0.5;
			} else {
				value =
					range.optimalMin -
					Math.random() * (range.optimalMin - range.min) * 0.5;
			}
		} else {
			if (Math.random() > 0.5) {
				value =
					range.max - Math.random() * (range.max - range.optimalMax) * 0.3;
			} else {
				value =
					range.min + Math.random() * (range.optimalMin - range.min) * 0.3;
			}
		}

		value = Math.max(range.min, Math.min(range.max, value));

		readings.push({
			id: `${pondId}-${sensorType}-${i}`,
			timestamp: sevenDaysAgo + i * interval,
			value: Math.round(value * 100) / 100,
			unit: range.unit,
			sensorId: `${pondId}-${sensorType}`,
			pondId,
		});
	}

	return readings;
}

export function generateMockPonds(count: number = 10): Pond[] {
	if (pondsCache.length > 0) return pondsCache;

	const locations = [
		'North Section',
		'South Section',
		'East Wing',
		'West Wing',
		'Central Area',
		'Lower Basin',
		'Upper Basin',
		'Main Tank',
		'Secondary Tank',
		'Research Area',
	];

	for (let i = 1; i <= count; i++) {
		pondsCache.push({
			id: `pond-${i}`,
			name: `Pond ${i}`,
			location: locations[i - 1] || `Area ${i}`,
			capacity: 5000 + Math.random() * 15000,
			area: 100 + Math.random() * 400,
			operatorId: i <= 3 ? `operator-${Math.ceil(i / 3)}` : 'operator-2',
		});
	}

	return pondsCache;
}

export function generateMockUsers(): User[] {
	return [
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
}

export function generateMockDashboardData(): DashboardData {
	const ponds = generateMockPonds(10);
	const users = generateMockUsers();

	const latestReadings: Record<string, SensorReading[]> = {};
	const sensors = ['temperature', 'ph', 'dox', 'salinity', 'humidity'];

	ponds.forEach((pond) => {
		latestReadings[pond.id] = [];
		sensors.forEach((sensor) => {
			const readings = generateSensorReadings(pond.id, sensor, 50);
			latestReadings[pond.id].push(readings[readings.length - 1]);
		});
	});

	return {
		ponds,
		users,
		latestReadings,
	};
}

export function generateTimeSeriesData(
	pondId: string,
	sensorType: string,
	days: number = 7,
): SensorReading[] {
	const hoursPerDay = 24;
	const readingsPerHour = 12;
	const count = days * hoursPerDay * readingsPerHour;

	return generateSensorReadings(pondId, sensorType, count);
}
