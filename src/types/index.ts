export type WatchStatus = 'owned' | 'sold' | 'gifted'

export type Movement =
  | 'automatic'
  | 'manual'
  | 'quartz'
  | 'spring-drive'
  | 'solar'
  | 'kinetic'
  | 'smart'
  | 'other'

export type Currency = 'GBP' | 'USD' | 'EUR' | 'CAD' | 'CHF' | 'AUD' | 'JPY' | 'SGD' | 'HKD'

export interface Money {
  amount: number
  currency: Currency
}

export interface Location {
  city?: string
  region?: string
  country?: string
  lat?: number
  lng?: number
}

export interface Watch {
  id: string
  brand: string
  model: string
  reference?: string
  nickname?: string

  movement?: Movement
  caliber?: string
  caseMaterial?: string
  caseDiameterMm?: number
  caseThicknessMm?: number
  lugWidthMm?: number
  waterResistanceM?: number
  complications?: string[]
  dialColor?: string
  bezel?: string
  crystal?: string
  yearProduced?: number
  /** Exact manufacture date when known — anchors the first-service due date
   *  for watches with no service history yet. */
  manufactureDate?: string

  acquisitionDate?: string
  acquisitionPrice?: Money
  acquisitionPriceGbp?: number
  acquisitionSource?: string
  /** True if this watch was received as a gift — excluded from spend metrics. */
  wasGift?: boolean

  currentValue?: Money
  currentValueGbp?: number
  valueDate?: string

  status: WatchStatus
  saleDate?: string
  salePrice?: Money
  salePriceGbp?: number
  saleNotes?: string
  giftedTo?: string
  giftedDate?: string

  notes?: string
  photos?: string[]
  tags?: string[]
  category?: WatchCategory
  serviceIntervalMonths?: number

  createdAt: string
  updatedAt: string
}

export type WatchCategory =
  | 'dress'
  | 'sport'
  | 'diver'
  | 'chronograph'
  | 'gmt'
  | 'pilot'
  | 'field'
  | 'racing'
  | 'casual'
  | 'smart'
  | 'other'

export interface WearLogEntry {
  id: string
  watchId: string
  date: string
  location?: Location
  notes?: string
  source?: 'manual' | 'geolocation' | 'imported'
  createdAt: string
}

export interface WishlistItem {
  id: string
  brand: string
  model: string
  reference?: string
  priority: 1 | 2 | 3 | 4 | 5
  targetPrice?: Money
  targetPriceGbp?: number
  category?: WatchCategory
  notes?: string
  links?: string[]
  imageUrl?: string
  addedDate: string
}

export type ServiceType =
  | 'full-service'
  | 'battery'
  | 'regulation'
  | 'gasket'
  | 'polish'
  | 'repair'
  | 'other'

export interface ServiceLogEntry {
  id: string
  watchId: string
  date: string
  type: ServiceType
  watchmaker?: string
  cost?: Money
  costGbp?: number
  notes?: string
  nextDueDate?: string
}

export interface Valuation {
  id: string
  watchId: string
  date: string
  value: Money
  valueGbp: number
  source?: string
  notes?: string
}

export interface AppData {
  watches: Watch[]
  wearLog: WearLogEntry[]
  wishlist: WishlistItem[]
  serviceLog: ServiceLogEntry[]
  valuations: Valuation[]
  schemaVersion: number
  updatedAt: string
}

export const EMPTY_DATA: AppData = {
  watches: [],
  wearLog: [],
  wishlist: [],
  serviceLog: [],
  valuations: [],
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
}

export interface AuthConfig {
  username: string
  dataRepo: string
  branch: string
  token: string
}
