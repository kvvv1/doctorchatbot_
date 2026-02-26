'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface SLAIndicatorProps {
	lastPatientMessageAt: string | null
	/** Threshold in minutes after which the indicator turns red */
	thresholdMinutes?: number
	/** Whether to show the indicator even when there's no patient message */
	showWhenEmpty?: boolean
}

/**
 * SLAIndicator - Displays time elapsed since last patient message
 * Turns red when threshold is exceeded, indicating urgent attention needed
 */
export default function SLAIndicator({
	lastPatientMessageAt,
	thresholdMinutes = 30,
	showWhenEmpty = false,
}: SLAIndicatorProps) {
	const [timeElapsed, setTimeElapsed] = useState<string>('')
	const [isOverThreshold, setIsOverThreshold] = useState(false)

	useEffect(() => {
		if (!lastPatientMessageAt) {
			setTimeElapsed('')
			setIsOverThreshold(false)
			return
		}

		const updateTime = () => {
			const now = new Date()
			const lastMessageDate = new Date(lastPatientMessageAt)
			const diffMs = now.getTime() - lastMessageDate.getTime()
			const diffMinutes = Math.floor(diffMs / (1000 * 60))

			// Check if over threshold
			setIsOverThreshold(diffMinutes >= thresholdMinutes)

			// Format time elapsed
			if (diffMinutes < 1) {
				setTimeElapsed('agora')
			} else if (diffMinutes < 60) {
				setTimeElapsed(`${diffMinutes}m`)
			} else if (diffMinutes < 1440) {
				// Less than 24 hours
				const hours = Math.floor(diffMinutes / 60)
				const mins = diffMinutes % 60
				setTimeElapsed(mins > 0 ? `${hours}h${mins}m` : `${hours}h`)
			} else {
				// More than 24 hours
				const days = Math.floor(diffMinutes / 1440)
				setTimeElapsed(`${days}d`)
			}
		}

		// Initial update
		updateTime()

		// Update every minute
		const interval = setInterval(updateTime, 60000)

		return () => clearInterval(interval)
	}, [lastPatientMessageAt, thresholdMinutes])

	if (!lastPatientMessageAt && !showWhenEmpty) {
		return null
	}

	if (!lastPatientMessageAt) {
		return (
			<div className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
				<Clock className="size-2.5" />
				<span>--</span>
			</div>
		)
	}

	return (
		<div
			className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
				isOverThreshold
					? 'bg-red-100 text-red-700 border border-red-300'
					: 'bg-neutral-100 text-neutral-600'
			}`}
			title={`Última mensagem do paciente: ${isOverThreshold ? 'ATENÇÃO! ' : ''}há ${timeElapsed}`}
		>
			<Clock className="size-2.5" />
			<span>{timeElapsed}</span>
		</div>
	)
}
