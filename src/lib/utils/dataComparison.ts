/**
 * Utility functions for comparing data arrays and preventing unnecessary re-renders
 */

/**
 * Compare two arrays by a specific key (e.g., 'id' or 'updated_at')
 * Returns true if arrays are different, false if they're the same
 * 
 * @example
 * const hasChanges = hasArrayChanged(oldConversations, newConversations, 'updated_at')
 * if (hasChanges) {
 *   setConversations(newConversations)
 * }
 */
export function hasArrayChanged<T>(
	oldArray: T[] | null,
	newArray: T[] | null,
	compareKey: keyof T
): boolean {
	// If one is null and other is not, changed
	if (!oldArray || !newArray) {
		return oldArray !== newArray
	}

	// Different lengths = changed
	if (oldArray.length !== newArray.length) {
		return true
	}

	// Check if any item changed
	for (let i = 0; i < oldArray.length; i++) {
		if (oldArray[i][compareKey] !== newArray[i][compareKey]) {
			return true
		}
	}

	return false
}

/**
 * Compare two items by a specific key
 * Returns true if items are different
 */
export function hasItemChanged<T>(
	oldItem: T | null,
	newItem: T | null,
	compareKey: keyof T
): boolean {
	if (!oldItem || !newItem) {
		return oldItem !== newItem
	}

	return oldItem[compareKey] !== newItem[compareKey]
}

/**
 * Deep comparison of two arrays of objects
 * More expensive but more accurate
 */
export function deepArrayEquals<T>(a: T[], b: T[]): boolean {
	if (a.length !== b.length) return false
	
	try {
		return JSON.stringify(a) === JSON.stringify(b)
	} catch {
		return false
	}
}

/**
 * Check if user is scrolled to bottom of an element
 * Useful for auto-scroll logic
 */
export function isScrolledToBottom(element: HTMLElement, threshold = 50): boolean {
	const { scrollTop, scrollHeight, clientHeight } = element
	return scrollHeight - scrollTop - clientHeight < threshold
}
