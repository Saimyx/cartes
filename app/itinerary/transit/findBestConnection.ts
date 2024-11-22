import { humanDepartureTime } from '../../transport/stop/Route'
import { dateFromMotis, humanDuration } from './utils'

const connectionDuration = (connection) =>
	connection.stops.slice(-1)[0].arrival.time -
	connection.stops[0].departure.time

export default function findBestConnection(connections) {
	console.log('bestConnection connections', connections)

	/*
	 * Very simple algorithm to find a best candidate
	 * to be highlighted at the top
	 * */
	const selected = connections
		// walk segments don't have trips. We want a direct connection, only one trip
		.filter((connection) => connection.trips.length === 1)
		//TODO this selection should probably made using distance, not time. Or both.
		//it's ok to walk 20 min, and take the train for 10 min, if the train goes at
		//200 km/h
		.filter((connection) => {
			const walking = connection.transports.filter(
					(transport) => transport.move_type === 'Walk'
				),
				walkingTime = walking.reduce((memo, next) => memo + next.seconds, 0)

			return (
				walkingTime <
				// experimental, not optimal at all. See note above
				// TODO compute according to transit/modes/decodeStepModeParams !
				2 *
					connection.transports.find(
						(transport) => transport.move_type === 'Transport'
					).seconds
			)
		})
	console.log('bestConnection selected', selected)
	if (!selected.length) return null

	const best = selected.reduce((memo, next) => {
		if (memo === null) return next
		if (connectionDuration(next) < connectionDuration(memo)) return next
		return memo
	}, null)

	const nextDepartures = selected
		.filter((connection) => bestSignature(connection) === bestSignature(best))
		.map((connection) => {
			try {
				const departure = connection.stops[0].departure.time
				const date = new Date(departure * 1000)
				if (date.getTime() < new Date().getTime()) return false
				const humanTime = humanDepartureTime(date, true)
				return humanTime
			} catch (e) {
				console.log('Error building best connection next departures', e)
			}
		})
		.filter(Boolean)

	console.log('bestConnection next departures', nextDepartures)
	// This is arbitrary. It helps us exclude the display of the "best connection"
	// bloc in the case of onTrip requests. We could also just compute the onTrip
	// status as a criteria, but who knows, maybe this mode can produce a best
	// connection with 3 next departures in some cases ?
	if (nextDepartures.length < 2) return null

	return {
		best,
		interval: getBestIntervals(connections, best),
		nextDepartures,
	}
}

export const bestSignature = (connection) => connection.trips[0].id.line_id

export const getBestIntervals = (connections, best) => {
	const bests = connections.filter(
		(connection) =>
			connection.trips.length === 1 &&
			bestSignature(connection) === bestSignature(best)
	)
	const departures = bests.map(
		(connection) => connection.stops[0].departure.time
	)

	if (departures.length === 1) return 'une fois par jour'

	const dates = departures.map((departure) => dateFromMotis(departure))

	const intervals = departures
		.map((date, i) => i > 0 && date - departures[i - 1])
		.filter(Boolean)
	const max = Math.max(...intervals)

	console.log('orange max', max, intervals)
	const description = humanDuration(max).interval
	return description
}

const removeDans = (dans) => (s) => dans ? s.replace('dans ', '') : s
const removeÀ = (à) => (s) => à ? s.replace('à ', '') : s
export const nextDeparturesSentence = (departures) => {
	let dans = false,
		à = false

	return departures
		.slice(0, 4)
		.map((departure) => {
			const lower = departure.toLowerCase()
			const result = removeDans(dans)(removeÀ(à)(lower))
			if (lower.includes('dans ')) dans = true
			if (lower.includes('à ')) à = true
			return result
		})
		.join(', ')
}
