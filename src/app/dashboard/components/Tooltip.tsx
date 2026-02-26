'use client'

import { useState, useRef, useEffect } from 'react'

interface TooltipProps {
	content: string
	children: React.ReactNode
	side?: 'top' | 'right' | 'bottom' | 'left'
	disabled?: boolean
}

export default function Tooltip({ 
	content, 
	children, 
	side = 'right',
	disabled = false 
}: TooltipProps) {
	const [isVisible, setIsVisible] = useState(false)
	const timeoutRef = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [])

	const handleMouseEnter = () => {
		if (disabled) return
		timeoutRef.current = setTimeout(() => {
			setIsVisible(true)
		}, 300)
	}

	const handleMouseLeave = () => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
		}
		setIsVisible(false)
	}

	const positionClasses = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
		right: 'left-full top-1/2 -translate-y-1/2 ml-2',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
		left: 'right-full top-1/2 -translate-y-1/2 mr-2',
	}

	return (
		<div 
			className="relative inline-block"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{children}
			{isVisible && !disabled && (
				<div
					className={`
						absolute z-50 whitespace-nowrap rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg
						${positionClasses[side]}
						animate-in fade-in-0 zoom-in-95 duration-200
					`}
					role="tooltip"
				>
					{content}
					{/* Arrow */}
					<div
						className={`
							absolute size-2 rotate-45 bg-neutral-900
							${side === 'right' && '-left-1 top-1/2 -translate-y-1/2'}
							${side === 'left' && '-right-1 top-1/2 -translate-y-1/2'}
							${side === 'top' && 'left-1/2 -bottom-1 -translate-x-1/2'}
							${side === 'bottom' && 'left-1/2 -top-1 -translate-x-1/2'}
						`}
					/>
				</div>
			)}
		</div>
	)
}
