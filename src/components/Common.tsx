export function LoadingSpinner() {
	return (
		<div className="flex justify-center items-center h-64">
			<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
		</div>
	);
}

interface ErrorMessageProps {
	message: string;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
	return (
		<div className="bg-red-50 border border-red-200 rounded-lg p-4">
			<p className="text-red-700 font-medium">Error</p>
			<p className="text-red-600 text-sm mt-1">{message}</p>
		</div>
	);
}

interface BackButtonProps {
	href?: string;
	label?: string;
}

export function BackButton({
	href = '/dashboard',
	label = '← Back',
}: BackButtonProps) {
	return (
		<a
			href={href}
			className="text-green-600 hover:text-green-800 text-sm font-medium mb-4 inline-block">
			{label}
		</a>
	);
}
