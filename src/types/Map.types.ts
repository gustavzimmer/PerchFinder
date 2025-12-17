export interface geoLocation {
    lat: number
    lng: number
}

export interface WaterLocation {
    location: geoLocation
    createdAt: string
    name: string
}