'use client';

import { ErrorMessage, LoadingSpinner } from '@/components/Common';
import MainLayout from '@/components/MainLayout';
import { usePonds, useSensorReadings } from '@/hooks/useApi';
import { useAuthStore } from '@/store/authStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

interface ReportFormData {
	pondId: string;
	sensorType: string;
	dateRange: 'week' | 'month' | 'year';
}

const SENSOR_TYPES = [
	{ value: 'temperature', label: 'Temperature' },
	{ value: 'ph', label: 'pH Level' },
	{ value: 'dox', label: 'Dissolved Oxygen' },
	{ value: 'salinity', label: 'Salinity' },
	{ value: 'humidity', label: 'Humidity' },
];

export default function ReportsPage() {
	const router = useRouter();
	const { isAuthenticated, user } = useAuthStore();
	const { ponds, isLoading: isPondsLoading } = usePonds();
	const [selectedValues, setSelectedValues] = useState<ReportFormData | null>(
		null,
	);
	const { readings, isLoading: isReadingsLoading } = useSensorReadings(
		selectedValues?.pondId || '',
		selectedValues?.sensorType || '',
	);

	const { register, handleSubmit, watch } = useForm<ReportFormData>({
		defaultValues: { pondId: '', sensorType: 'temperature', dateRange: 'week' },
	});

	const formValues = watch();

	useEffect(() => {
		if (!isAuthenticated) router.push('/login');
		if (isAuthenticated && user?.role === 'viewer') router.push('/dashboard');
	}, [isAuthenticated, user, router]);

	if (!isAuthenticated || user?.role === 'viewer') return null;

	const handleGeneratePDF = () => {
		if (!selectedValues || !readings) return;

		const pond = ponds?.find((p) => p.id === selectedValues.pondId);
		const sensor = SENSOR_TYPES.find(
			(s) => s.value === selectedValues.sensorType,
		);

		const pdf = new jsPDF();
		pdf.setFontSize(20);
		pdf.text(`${sensor?.label} Report - ${pond?.name}`, 15, 15);
		pdf.setFontSize(10);
		pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 15, 25);
		pdf.text(`Location: ${pond?.location}`, 15, 30);
		pdf.text(`Period: Last ${selectedValues.dateRange}`, 15, 35);

		const tableData = readings
			.slice(-50)
			.reverse()
			.map((r) => [
				new Date(r.timestamp).toLocaleString(),
				r.value.toFixed(2),
				`${r.unit}`,
			]);

		autoTable(pdf, {
			head: [['Time', 'Value', 'Unit']],
			body: tableData,
			startY: 45,
			theme: 'grid',
			didDrawPage: (data) => {
				const pageSize = pdf.internal.pageSize;
				pdf.setFontSize(8);
				pdf.text(
					`Page ${data.pageNumber}`,
					pageSize.getWidth() / 2,
					pageSize.getHeight() - 10,
					{ align: 'center' },
				);
			},
		});

		pdf.save(
			`${sensor?.label}_${pond?.name}_${new Date().toISOString().split('T')[0]}.pdf`,
		);
	};

	const handleGenerateCSV = () => {
		if (!selectedValues || !readings) return;

		const pond = ponds?.find((p) => p.id === selectedValues.pondId);
		const sensor = SENSOR_TYPES.find(
			(s) => s.value === selectedValues.sensorType,
		);

		const csvContent = [
			['Time', 'Value', 'Unit'],
			...readings.map((r) => [
				new Date(r.timestamp).toLocaleString(),
				r.value.toFixed(2),
				r.unit,
			]),
		]
			.map((row) => row.map((cell) => `"${cell}"`).join(','))
			.join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${sensor?.label}_${pond?.name}_${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		window.URL.revokeObjectURL(url);
	};

	const onSubmit = (data: ReportFormData) => {
		setSelectedValues(data);
	};

	return (
		<MainLayout>
			<div className="space-y-8">
				<div>
					<h1 className="text-4xl font-bold text-gray-900">Reports</h1>
					<p className="text-gray-600 mt-2">Generate PDF and CSV reports</p>
				</div>

				<div className="bg-white rounded-lg shadow p-8">
					<h2 className="text-2xl font-semibold text-gray-900 mb-6">
						Generate Report
					</h2>

					{isPondsLoading ? (
						<LoadingSpinner />
					) : (
						<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label
										htmlFor="pondId"
										className="block text-sm font-medium text-gray-700 mb-2">
										Pond
									</label>
									<select
										id="pondId"
										{...register('pondId', { required: 'Select a pond' })}
										className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900">
										<option value="">Choose a pond...</option>
										{ponds?.map((pond) => (
											<option key={pond.id} value={pond.id}>
												{pond.name} - {pond.location}
											</option>
										))}
									</select>
								</div>

								<div>
									<label
										htmlFor="sensorType"
										className="block text-sm font-medium text-gray-700 mb-2">
										Sensor Type
									</label>
									<select
										id="sensorType"
										{...register('sensorType')}
										className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900">
										{SENSOR_TYPES.map((sensor) => (
											<option key={sensor.value} value={sensor.value}>
												{sensor.label}
											</option>
										))}
									</select>
								</div>

								<div>
									<label
										htmlFor="dateRange"
										className="block text-sm font-medium text-gray-700 mb-2">
										Time Period
									</label>
									<select
										id="dateRange"
										{...register('dateRange')}
										className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900">
										<option value="week">Last Week</option>
										<option value="month">Last Month</option>
										<option value="year">Last Year</option>
									</select>
								</div>
							</div>

							<button
								type="submit"
								className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors">
								Load Report Data
							</button>
						</form>
					)}
				</div>

				{selectedValues && readings && readings.length > 0 && (
					<div className="space-y-6">
						{isReadingsLoading ? (
							<LoadingSpinner />
						) : (
							<>
								<div className="flex gap-4">
									<button
										onClick={handleGeneratePDF}
										className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
										Download PDF
									</button>
									<button
										onClick={handleGenerateCSV}
										className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors">
										Download CSV
									</button>
								</div>

								<div className="bg-white rounded-lg shadow p-6">
									<h3 className="text-xl font-semibold text-gray-900 mb-4">
										Report Summary
									</h3>
									<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
										<div>
											<p className="text-gray-600 text-sm">Records</p>
											<p className="text-2xl font-bold text-green-600">
												{readings.length}
											</p>
										</div>
										<div>
											<p className="text-gray-600 text-sm">Average</p>
											<p className="text-2xl font-bold text-green-600">
												{(
													readings.reduce((sum, r) => sum + r.value, 0) /
													readings.length
												).toFixed(2)}
											</p>
										</div>
										<div>
											<p className="text-gray-600 text-sm">Max</p>
											<p className="text-2xl font-bold text-red-600">
												{Math.max(...readings.map((r) => r.value)).toFixed(2)}
											</p>
										</div>
										<div>
											<p className="text-gray-600 text-sm">Min</p>
											<p className="text-2xl font-bold text-orange-600">
												{Math.min(...readings.map((r) => r.value)).toFixed(2)}
											</p>
										</div>
									</div>
								</div>

								<div className="bg-white rounded-lg shadow overflow-x-auto">
									<h3 className="text-xl font-semibold text-gray-900 p-6">
										Data Preview
									</h3>
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
													Unit
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-gray-200">
											{readings
												.slice(-20)
												.reverse()
												.map((reading, idx) => (
													<tr key={idx} className="hover:bg-gray-50">
														<td className="px-6 py-4 text-sm text-gray-900">
															{new Date(reading.timestamp).toLocaleString()}
														</td>
														<td className="px-6 py-4 text-sm text-gray-900 font-semibold">
															{reading.value.toFixed(2)}
														</td>
														<td className="px-6 py-4 text-sm text-gray-900">
															{reading.unit}
														</td>
													</tr>
												))}
										</tbody>
									</table>
								</div>
							</>
						)}
					</div>
				)}
			</div>
		</MainLayout>
	);
}
