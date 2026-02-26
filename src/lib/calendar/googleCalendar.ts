/**
 * Google Calendar Service
 * Handles OAuth and event creation for Google Calendar integration
 */

import { google } from 'googleapis'

interface CreateEventParams {
	accessToken: string
	refreshToken: string
	calendarId: string
	title: string
	startsAt: Date
	endsAt: Date
	description?: string
	patientPhone?: string
}

interface RefreshTokenResponse {
	accessToken: string
	expiresIn: number
}

/**
 * Creates OAuth2 client with credentials
 */
function getOAuth2Client() {
	return new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID,
		process.env.GOOGLE_CLIENT_SECRET,
		process.env.GOOGLE_REDIRECT_URI
	)
}

/**
 * Refreshes the access token if needed
 */
export async function refreshAccessToken(
	refreshToken: string
): Promise<RefreshTokenResponse> {
	try {
		const oauth2Client = getOAuth2Client()
		oauth2Client.setCredentials({
			refresh_token: refreshToken,
		})

		const { credentials } = await oauth2Client.refreshAccessToken()

		if (!credentials.access_token || !credentials.expiry_date) {
			throw new Error('Failed to refresh access token')
		}

		return {
			accessToken: credentials.access_token,
			expiresIn: credentials.expiry_date,
		}
	} catch (error) {
		console.error('Error refreshing access token:', error)
		throw new Error('Failed to refresh access token')
	}
}

/**
 * Creates an event in Google Calendar
 */
export async function createCalendarEvent(
	params: CreateEventParams
): Promise<string> {
	try {
		const oauth2Client = getOAuth2Client()
		oauth2Client.setCredentials({
			access_token: params.accessToken,
			refresh_token: params.refreshToken,
		})

		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

		const event = {
			summary: params.title,
			description: params.description || '',
			start: {
				dateTime: params.startsAt.toISOString(),
				timeZone: 'America/Sao_Paulo',
			},
			end: {
				dateTime: params.endsAt.toISOString(),
				timeZone: 'America/Sao_Paulo',
			},
		}

		const response = await calendar.events.insert({
			calendarId: params.calendarId,
			requestBody: event,
		})

		if (!response.data.id) {
			throw new Error('Event created but no ID returned')
		}

		console.log('Event created successfully:', response.data.id)
		return response.data.id
	} catch (error: any) {
		console.error('Error creating calendar event:', error)

		// If token is expired, try to refresh and retry once
		if (error.code === 401 && params.refreshToken) {
			try {
				console.log('Token expired, attempting to refresh...')
				const { accessToken } = await refreshAccessToken(params.refreshToken)
				
				// Retry with new token
				return createCalendarEvent({
					...params,
					accessToken,
				})
			} catch (refreshError) {
				console.error('Failed to refresh token:', refreshError)
				throw new Error('Authentication failed - please reconnect Google Calendar')
			}
		}

		throw new Error('Failed to create calendar event')
	}
}

/**
 * Deletes an event from Google Calendar
 */
export async function deleteCalendarEvent(
	accessToken: string,
	refreshToken: string,
	calendarId: string,
	eventId: string
): Promise<void> {
	try {
		const oauth2Client = getOAuth2Client()
		oauth2Client.setCredentials({
			access_token: accessToken,
			refresh_token: refreshToken,
		})

		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

		await calendar.events.delete({
			calendarId,
			eventId,
		})

		console.log('Event deleted successfully:', eventId)
	} catch (error: any) {
		console.error('Error deleting calendar event:', error)

		// If token is expired, try to refresh and retry once
		if (error.code === 401 && refreshToken) {
			try {
				const { accessToken: newAccessToken } = await refreshAccessToken(
					refreshToken
				)
				return deleteCalendarEvent(
					newAccessToken,
					refreshToken,
					calendarId,
					eventId
				)
			} catch (refreshError) {
				console.error('Failed to refresh token:', refreshError)
				throw new Error('Authentication failed - please reconnect Google Calendar')
			}
		}

		throw new Error('Failed to delete calendar event')
	}
}

/**
 * Updates an event in Google Calendar
 */
export async function updateCalendarEvent(
	params: CreateEventParams & { eventId: string }
): Promise<void> {
	try {
		const oauth2Client = getOAuth2Client()
		oauth2Client.setCredentials({
			access_token: params.accessToken,
			refresh_token: params.refreshToken,
		})

		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

		const event = {
			summary: params.title,
			description: params.description || '',
			start: {
				dateTime: params.startsAt.toISOString(),
				timeZone: 'America/Sao_Paulo',
			},
			end: {
				dateTime: params.endsAt.toISOString(),
				timeZone: 'America/Sao_Paulo',
			},
		}

		await calendar.events.update({
			calendarId: params.calendarId,
			eventId: params.eventId,
			requestBody: event,
		})

		console.log('Event updated successfully:', params.eventId)
	} catch (error: any) {
		console.error('Error updating calendar event:', error)

		// If token is expired, try to refresh and retry once
		if (error.code === 401 && params.refreshToken) {
			try {
				const { accessToken } = await refreshAccessToken(params.refreshToken)
				return updateCalendarEvent({
					...params,
					accessToken,
				})
			} catch (refreshError) {
				console.error('Failed to refresh token:', refreshError)
				throw new Error('Authentication failed - please reconnect Google Calendar')
			}
		}

		throw new Error('Failed to update calendar event')
	}
}

/**
 * Generates the authorization URL for OAuth consent
 */
export function getAuthorizationUrl(): string {
	const oauth2Client = getOAuth2Client()

	const scopes = ['https://www.googleapis.com/auth/calendar.events']

	const authUrl = oauth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: scopes,
		prompt: 'consent', // Force to get refresh token
	})

	return authUrl
}

/**
 * Exchanges authorization code for tokens
 */
export async function getTokensFromCode(code: string): Promise<{
	accessToken: string
	refreshToken: string
	expiryDate: number
}> {
	try {
		const oauth2Client = getOAuth2Client()
		const { tokens } = await oauth2Client.getToken(code)

		if (!tokens.access_token || !tokens.refresh_token) {
			throw new Error('Failed to get tokens from code')
		}

		return {
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
		}
	} catch (error) {
		console.error('Error getting tokens from code:', error)
		throw new Error('Failed to exchange authorization code for tokens')
	}
}
