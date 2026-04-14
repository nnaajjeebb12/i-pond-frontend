export interface SensorReading {
	id: string;
	timestamp: number;
	value: number;
	unit: string;
	sensorId: string;
	pondId: string;
}

export interface Pond {
	id: string;
	name: string;
	location: string;
	capacity: number;
	area: number;
	operatorId?: string;
}

export interface User {
	id: string;
	email: string;
	name: string;
	role: 'admin' | 'operator' | 'viewer';
	createdAt: number;
	pondIds?: string[];
	operatorId?: string;
}

export interface DashboardData {
	ponds: Pond[];
	users: User[];
	latestReadings: Record<string, SensorReading[]>;
}
