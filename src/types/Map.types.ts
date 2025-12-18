export interface geoLocation {
    lat: number
    lng: number
}

export interface RegisterWaterLocation {
    location: geoLocation
    createdAt: string
    name: string
    catchCount?: number
    detailPath?: string
}

export interface WaterLocation {
    _id: string
    location: geoLocation
    createdAt: string
    name: string
    catchCount?: number
    detailPath?: string
}
