import maplibregl, { ScaleControl } from 'maplibre-gl'
import { useEffect, useMemo, useState } from 'react'
import { useLocalStorage, useMediaQuery } from 'usehooks-ts'
import { styles } from '../styles/styles'
import { Protocol as ProtomapsProtocol } from 'pmtiles'
import useGeolocation from './useGeolocation'
import frenchMaplibreLocale from '@/components/map/frenchMaplibreLocale.ts'
import { Protocol as CartesProtocol } from '@/components/map/CartesProtocol.ts'

/*
 *
 * {"city":"Rennes","country":"FR","flag":"🇫🇷","countryRegion":"BRE","region":"cdg1","latitude":"48.11","longitude":"-1.6744"}
 *
 * */

const defaultSky = {
	'sky-color': '#76508B',
	'horizon-color': '#FCB4AB',
	'fog-color': '#FD8E35',
}

const defaultCenter =
	// Saint Malo
	// [-1.9890417068124002, 48.66284934737089]
	// Rennes [-1.678, 48.11]
	[2.025, 46.857]
export const defaultZoom = 5.52
const defaultHash = `#${defaultZoom}/${defaultCenter[1]}/${defaultCenter[0]}`

export default function useAddMap(
	styleUrl,
	setZoom,
	setBbox,
	mapContainerRef,
	setGeolocation
) {
	const [map, setMap] = useState(null)
	const [geolocate, setGeolocate] = useState(null)
	const isMobile = useMediaQuery('(max-width: 800px)')
	// This could probably be done with a Next Middleware, to avoid a second
	// request, but I could not make it work in 5 minutes
	const geolocation = useGeolocation({
		latitude: defaultCenter[1],
		longitude: defaultCenter[0],
	})
	//	console.log('geolocation', geolocation)
	const { latitude, longitude } = geolocation

	const ipGeolocationCenter = [longitude, latitude]

	useEffect(() => {
		if (!map) return

		//TODO see https://github.com/laem/cartes/pull/370
		return
		map.flyTo({
			center: ipGeolocationCenter,
		})
	}, [ipGeolocationCenter, map])

	useEffect(() => {
		let protomapsProtocol = new ProtomapsProtocol()
		//let cartesProtocol = new CartesProtocol()
		maplibregl.addProtocol('pmtiles', protomapsProtocol.tile)
		//maplibregl.addProtocol('cartes', cartesProtocol.tile)
		return () => {
			maplibregl.removeProtocol('pmtiles')
			//	maplibregl.removeProtocol('cartes')
		}
	}, [])

	const [autoPitchPreference, setAutoPitchPreference] = useLocalStorage(
		'autoPitchPreference',
		null
	)

	useEffect(() => {
		if (!map) return
		const compass = document.querySelector('.maplibregl-ctrl-compass')
		if (!compass) return
		const handler = () => {
			const autoPitchPreferenceIsWaiting =
				typeof autoPitchPreference === 'number'
			if (
				autoPitchPreferenceIsWaiting &&
				new Date().getTime() / 1000 - autoPitchPreference < 15 // If the user resets the pitch in less than 15 seconds, we consider it a definitive choice
			)
				setAutoPitchPreference('no')
		}
		compass.addEventListener('click', handler)

		return () => {
			compass && compass.removeEventListener('click', handler)
		}
	}, [map, autoPitchPreference, setAutoPitchPreference])

	useEffect(() => {
		if (!mapContainerRef.current) return undefined

		const newMap = new maplibregl.Map({
			container: mapContainerRef.current,
			style: styleUrl,
			maxPitch: 85,
			center: defaultCenter,
			zoom: defaultZoom,
			hash: true,
			attributionControl: false,
			locale: frenchMaplibreLocale,
			antialias: true,
		})

		const navigationControl = new maplibregl.NavigationControl({
			visualizePitch: true,
			showZoom: true,
			showCompass: true,
		})
		/*
		const navigationControlElement = navigationControl.onAdd(newMap)
		*/
		newMap.addControl(navigationControl, 'top-right')

		const geolocate = new maplibregl.GeolocateControl({
			positionOptions: {
				enableHighAccuracy: true,
			},
			trackUserLocation: true,
		})

		setGeolocate(geolocate)

		newMap.addControl(geolocate)

		geolocate.on('geolocate', function (e) {
			console.log('bleu ', e.coords)
			setGeolocation(e.coords)
		})

		newMap.on('load', () => {
			console.log('maplibre instance loaded with id ', newMap._mapId)
			setMap(newMap)
			newMap.setSky(defaultSky)

			setZoom(Math.round(newMap.getZoom()))
			setBbox(newMap.getBounds().toArray())
		})

		newMap.on('moveend', (e) => {
			setBbox(newMap.getBounds().toArray())
		})

		return () => {
			setMap(null)
			newMap?.remove()
		}
	}, [setMap, setZoom, setBbox, mapContainerRef, setGeolocate]) // styleUrl not listed on purpose

	useEffect(() => {
		if (!map) return
		setTimeout(() => {
			//TODO, I thought re-setting the sky would solve the problem of the sky
			//going away when changing style but no
			map.setSky(defaultSky)
		}, 1000)
	}, [map, styleUrl])
	const triggerGeolocation = useMemo(
		() => (geolocate ? () => geolocate.trigger() : () => 'Not ready'),
		[geolocate]
	)

	useEffect(() => {
		if (!map) return

		const scale = new ScaleControl({
			maxWidth: isMobile ? 80 : 200,
			unit: 'metric',
		})
		map.addControl(scale)
		return () => {
			if (!map || !scale) return
			try {
				map.removeControl(scale)
				// I don't understand why I get the "this._map is undefined" error on
				// hot reload
			} catch (e) {
				console.log('Error removing scale')
			}
		}
	}, [map, isMobile])

	useEffect(() => {
		if (!map || !isMobile || window.location.hash !== defaultHash) return
		setTimeout(() => {
			triggerGeolocation()
		}, 2000)
	}, [map, isMobile, triggerGeolocation])

	useEffect(() => {
		if (!map) return
		const style = Object.values(styles).find((style) => style.url === styleUrl)
		const attribution = new maplibregl.AttributionControl({
			customAttribution: style.attribution,
		})
		map.addControl(attribution)

		return () => {
			try {
				map.removeControl(attribution)
			} catch (e) {
				console.log('Error remove attribution', e)
			}
		}
	}, [map, styleUrl])

	return [map, triggerGeolocation, geolocate]
}
