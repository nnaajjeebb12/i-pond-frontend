import { SensorReading } from '@/types';

// Static mock data for April 6-14, 2026 (9 days)
// Generated once, loaded every time - no randomization

const SENSOR_CONFIGS = {
	temperature: { min: 18, max: 32, unit: '°C', optimalMin: 22, optimalMax: 27 },
	ph: { min: 5.5, max: 8.5, unit: 'pH', optimalMin: 6.5, optimalMax: 7.5 },
	dox: { min: 3, max: 11, unit: 'mg/L', optimalMin: 5, optimalMax: 8 },
	salinity: { min: 5, max: 40, unit: 'ppt', optimalMin: 15, optimalMax: 30 },
	humidity: { min: 50, max: 100, unit: '%', optimalMin: 60, optimalMax: 85 },
};

const STATIC_DATA: Record<string, SensorReading[]> = {};

function generateStaticData() {
	const startDate = new Date('2026-04-06T00:00:00').getTime();
	const endDate = new Date('2026-04-14T23:59:59').getTime();
	const interval = 5 * 60 * 1000; // 5 minutes
	const ponds = [
		'pond-1',
		'pond-2',
		'pond-3',
		'pond-4',
		'pond-5',
		'pond-6',
		'pond-7',
		'pond-8',
		'pond-9',
		'pond-10',
	];
	const sensorTypes = ['temperature', 'ph', 'dox', 'salinity', 'humidity'];

	// Seed-based pseudo-random for consistent data
	let seed = 12345;
	function seededRandom() {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	}

	ponds.forEach((pondId) => {
		sensorTypes.forEach((sensorType) => {
			const readings: SensorReading[] = [];
			const config = SENSOR_CONFIGS[sensorType as keyof typeof SENSOR_CONFIGS];
			let timestamp = startDate;

			while (timestamp <= endDate) {
				const hour = new Date(timestamp).getHours();
				const dayProgress = (hour / 24) * Math.PI * 2;

				let value: number;
				const rand = seededRandom();

				if (rand < 0.6) {
					const baseValue = (config.optimalMin + config.optimalMax) / 2;
					const timeVariation =
						Math.sin(dayProgress) *
						(config.optimalMax - config.optimalMin) *
						0.15;
					const variance =
						(seededRandom() - 0.5) *
						(config.optimalMax - config.optimalMin) *
						0.3;
					value = baseValue + timeVariation + variance;
				} else if (rand < 0.85) {
					if (seededRandom() > 0.5) {
						value =
							config.optimalMax +
							seededRandom() * (config.max - config.optimalMax) * 0.5;
					} else {
						value =
							config.optimalMin -
							seededRandom() * (config.optimalMin - config.min) * 0.5;
					}
				} else {
					if (seededRandom() > 0.5) {
						value =
							config.max -
							seededRandom() * (config.max - config.optimalMax) * 0.3;
					} else {
						value =
							config.min +
							seededRandom() * (config.optimalMin - config.min) * 0.3;
					}
				}

				value = Math.max(config.min, Math.min(config.max, value));

				readings.push({
					id: `${pondId}-${sensorType}-${timestamp}`,
					timestamp,
					value: Math.round(value * 100) / 100,
					unit: config.unit,
					sensorId: `${pondId}-${sensorType}`,
					pondId,
				});

				timestamp += interval;
			}

			STATIC_DATA[`${pondId}-${sensorType}`] = readings;
		});
	});
}

// Generate data once on module load
generateStaticData();

export function getStaticReadings(
	pondId: string,
	sensorType: string,
): SensorReading[] {
	return STATIC_DATA[`${pondId}-${sensorType}`] || [];
}

export function getStaticReadingsByDateRange(
	pondId: string,
	sensorType: string,
	days: number,
): SensorReading[] {
	const allReadings = STATIC_DATA[`${pondId}-${sensorType}`] || [];
	if (allReadings.length === 0) return [];

	const endDate = new Date('2026-04-14T23:59:59').getTime();
	const startDate = endDate - days * 24 * 60 * 60 * 1000;

	return allReadings.filter(
		(r) => r.timestamp >= startDate && r.timestamp <= endDate,
	);
}

export function getAllPondsStaticReadings(
	sensorType: string,
	days: number,
): SensorReading[] {
	const ponds = [
		'pond-1',
		'pond-2',
		'pond-3',
		'pond-4',
		'pond-5',
		'pond-6',
		'pond-7',
		'pond-8',
		'pond-9',
		'pond-10',
	];
	const allReadings: SensorReading[] = [];

	ponds.forEach((pondId) => {
		const readings = getStaticReadingsByDateRange(pondId, sensorType, days);
		allReadings.push(...readings);
	});

	return allReadings;
}
