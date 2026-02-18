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
    _id?: string
    location: geoLocation
    createdAt?: string
    name: string
    requestedAt?: unknown
    requestedBy?: string | null
    requestedByEmail?: string | null
    requestedByName?: string | null
    approvedAt?: unknown
    approvedBy?: string | null
    approvedByEmail?: string | null
    approvedByName?: string | null
    catchCount?: number
    detailPath?: string
}

export interface WaterRequest {
    _id?: string
    name: string
    location: geoLocation
    requestedAt?: unknown
    requestedBy?: string | null
    requestedByEmail?: string | null
    requestedByName?: string | null
}
