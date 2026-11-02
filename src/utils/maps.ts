/** Opens Google Maps (app on a phone, site on a computer) with turn-by-turn directions. Works without any API key. */
export const directionsUrl = (lat: number, lng: number, from?: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving${from ? `&origin=${from.lat},${from.lng}` : ''}`;

export const placeUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const hasCoords = (p: { lat?: number; lng?: number }) =>
  typeof p.lat === 'number' && typeof p.lng === 'number' && !(p.lat === 0 && p.lng === 0) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
