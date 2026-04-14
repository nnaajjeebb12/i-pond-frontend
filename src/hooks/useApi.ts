import { API_BASE_URL } from '@/constants/endpoints';
import {
	generateMockPonds,
	generateMockUsers,
	Pond,
	SensorReading,
	User,
} from '@/mocks/mockData';
import {
	getAllPondsStaticReadings,
	getStaticReadingsByDateRange,
} from '@/mocks/staticData';
import { useAuthStore } from '@/store/authStore';
import useSWR, { SWRConfiguration } from 'swr';

const mockUsers = generateMockUsers();

const mockFetcher = {
	ponds: async (): Promise<Pond[]> => {
		const data = generateMockPonds(10);
		await new Promise((resolve) => setTimeout(resolve, 50));
		return data;
	},
	pond: async (pondId: string): Promise<Pond | null> => {
		const ponds = generateMockPonds(10);
		await new Promise((resolve) => setTimeout(resolve, 50));
		return ponds.find((p: Pond) => p.id === pondId) || null;
	},
	user: async (): Promise<User | null> => {
		const users = generateMockUsers();
		await new Promise((resolve) => setTimeout(resolve, 50));
		return users[0] || null;
	},
	readings: async (
		pondId: string,
		sensorType: string,
		days: number = 7,
	): Promise<SensorReading[]> => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		const readings = getStaticReadingsByDateRange(pondId, sensorType, days);
		const sampleSize = Math.min(readings.length, 200);
		return readings.slice(-sampleSize);
	},
	allPondsReadings: async (
		sensorType: string,
		days: number = 7,
	): Promise<SensorReading[]> => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		const readings = getAllPondsStaticReadings(sensorType, days);
		const sampleSize = Math.min(readings.length, 100);
		return readings.slice(-sampleSize);
	},
};

const swrConfig: SWRConfiguration = {
	revalidateOnFocus: false,
	revalidateOnReconnect: false,
	dedupingInterval: 300000,
};

export function usePonds() {
	const { user } = useAuthStore();
	const { data, error, isLoading } = useSWR<Pond[]>(
		'ponds',
		mockFetcher.ponds,
		swrConfig,
	);

	let filteredPonds = data;
	if (user && user.role === 'operator' && user.pondIds) {
		filteredPonds = data?.filter((pond) => user.pondIds!.includes(pond.id));
	} else if (user && user.role === 'viewer' && user.operatorId) {
		const operator = mockUsers.find((u) => u.id === user.operatorId);
		if (operator && 'pondIds' in operator) {
			filteredPonds = data?.filter((pond) =>
				(operator as any).pondIds?.includes(pond.id),
			);
		}
	}

	return { ponds: filteredPonds, isLoading, error };
}

export function usePond(pondId?: string) {
	const { data, error, isLoading } = useSWR<Pond | null>(
		pondId ? `pond-${pondId}` : null,
		pondId ? () => mockFetcher.pond(pondId) : null,
		swrConfig,
	);
	return { pond: data, isLoading, error };
}

export function useUser() {
	const { data, error, isLoading } = useSWR<User | null>(
		'user',
		mockFetcher.user,
		swrConfig,
	);
	return { user: data, isLoading, error };
}

export function useSensorReadings(
	pondId: string,
	sensorType: string,
	days: number = 7,
) {
	const { data, error, isLoading } = useSWR<SensorReading[]>(
		`readings-${pondId}-${sensorType}-${days}`,
		() => mockFetcher.readings(pondId, sensorType, days),
		swrConfig,
	);
	return { readings: data, isLoading, error };
}

export function useAllPondsReadings(sensorType: string, days: number = 7) {
	const { data, error, isLoading } = useSWR<SensorReading[]>(
		`all-readings-${sensorType}-${days}`,
		() => mockFetcher.allPondsReadings(sensorType, days),
		swrConfig,
	);
	return { readings: data, isLoading, error };
}

export function useLatestReading(pondId: string, sensorType: string) {
	const { readings, isLoading, error } = useSensorReadings(pondId, sensorType);
	return { reading: readings?.[readings.length - 1] || null, isLoading, error };
}
