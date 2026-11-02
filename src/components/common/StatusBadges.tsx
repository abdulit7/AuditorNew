import React, { useState } from 'react';
import {
  MapPinCheck,
  MapPinOff,
  SignalLow,
  MapPinX,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Monitor,
  Smartphone,
  Navigation,
  Crosshair,
  ExternalLink,
} from 'lucide-react';
import { GPSVerificationStatus, EntityStatus, RoleSurface } from '../../types/infrastructure';
import { GoogleMap } from '../maps/GoogleMap';
import { directionsUrl, hasCoords } from '../../utils/maps';

export function formatPKR(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK')}`;
}

export function GPSStatusChip({ status }: { status: GPSVerificationStatus }) {
  switch (status) {
    case 'GPS Verified':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A34A] whitespace-nowrap shrink-0">
          <MapPinCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>GPS Verified</span>
        </span>
      );
    case 'Outside Allowed Radius':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#DC2626] whitespace-nowrap shrink-0">
          <MapPinOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Outside Allowed Radius</span>
        </span>
      );
    case 'Low GPS Accuracy':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309] whitespace-nowrap shrink-0">
          <SignalLow className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Low GPS Accuracy</span>
        </span>
      );
    case 'Location Unavailable':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] whitespace-nowrap shrink-0">
          <MapPinX className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Location Unavailable</span>
        </span>
      );
    case 'Awaiting Verification':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2563EB] whitespace-nowrap shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Awaiting Verification</span>
        </span>
      );
    case 'Approved Exception':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 whitespace-nowrap shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Approved Exception</span>
        </span>
      );
  }
}

export function EntityStatusIndicator({ status }: { status: EntityStatus }) {
  if (status === 'Active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A34A] whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Active</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] whitespace-nowrap shrink-0">
      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Inactive</span>
    </span>
  );
}

/**
 * Group A / Group B: neutral outlined badges in two distinct subtle tints,
 * kept separate from semantic audit-status colours so they are never confused.
 */
export function ProductGroupTag({ groupName }: { groupName: string }) {
  const isGroupA = groupName.toLowerCase().includes('group a') || groupName === 'GRP-A';
  const isGroupB = groupName.toLowerCase().includes('group b') || groupName === 'GRP-B';

  if (isGroupA) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border border-[#1E3A5F]/30 bg-[#1E3A5F]/[0.05] text-[#1E3A5F] whitespace-nowrap shrink-0">
        Group A
      </span>
    );
  }
  if (isGroupB) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border border-teal-700/30 bg-teal-900/[0.05] text-teal-800 whitespace-nowrap shrink-0">
        Group B
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border border-[#CBD5E1] bg-[#E9EEF5]/60 text-[#0F172A] whitespace-nowrap shrink-0">
      {groupName}
    </span>
  );
}

export function SurfaceAccessLabel({ surface }: { surface: RoleSurface }) {
  if (surface === 'Mobile PWA') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 whitespace-nowrap shrink-0">
        <Smartphone className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
        <span>Mobile App (APK)</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1E3A5F] whitespace-nowrap shrink-0">
      <Monitor className="w-3.5 h-3.5 text-[#2563EB] shrink-0" aria-hidden="true" />
      <span>Web Portal</span>
    </span>
  );
}

interface CoordinatesPickerProps {
  lat: number;
  lng: number;
  radiusMeters?: number;
  onChange: (lat: number, lng: number, radiusMeters?: number) => void;
  label?: string;
  showRadiusControl?: boolean;
  apiKey?: string;
  height?: number;
}

/**
 * Interactive Click-on-Map Coordinates Picker powered by MapLibre + OpenFreeMap (with optional Google Maps upgrade).
 * Click anywhere on the map or drag the pin to set Distributor, Shop, or Geography coordinates.
 */
export function CoordinatesPicker({
  lat,
  lng,
  radiusMeters = 50,
  onChange,
  label = 'Registered Master Coordinates',
  showRadiusControl = false,
  apiKey = '',
  height = 240,
}: CoordinatesPickerProps) {
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const safeLat = Number.isFinite(lat) ? lat : 31.5204;
  const safeLng = Number.isFinite(lng) ? lng : 74.3587;

  const handleMapPick = (nextLat: number, nextLng: number) => {
    const rLat = Number(nextLat.toFixed(6));
    const rLng = Number(nextLng.toFixed(6));
    onChange(rLat, rLng, radiusMeters);
    setGeoMessage(`Coordinates updated on map (${rLat.toFixed(5)}, ${rLng.toFixed(5)}).`);
  };

  const handleUseDeviceGPS = () => {
    if (!navigator.geolocation) {
      setGeoMessage('Browser geolocation unavailable; click anywhere on the map to set the pin.');
      return;
    }
    setLocating(true);
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const rLat = Number(pos.coords.latitude.toFixed(6));
        const rLng = Number(pos.coords.longitude.toFixed(6));
        onChange(rLat, rLng, radiusMeters);
        setGeoMessage(`Captured GPS (${rLat.toFixed(5)}, ${rLng.toFixed(5)} · ±${Math.round(pos.coords.accuracy)}m).`);
      },
      () => {
        setLocating(false);
        setGeoMessage('GPS permission declined or unavailable; click anywhere on the map below to set pin.');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  return (
    <div className="border border-[#CBD5E1] rounded-lg p-3.5 bg-[#F8FAFC] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#0F172A]">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          {hasCoords({ lat: safeLat, lng: safeLng }) && (
            <a
              href={directionsUrl(safeLat, safeLng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] bg-white border border-[#CBD5E1] rounded hover:bg-[#E9EEF5] transition-colors whitespace-nowrap shrink-0"
            >
              <Navigation className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
              <span>Directions</span>
              <ExternalLink className="w-3 h-3 text-[#475569]" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={handleUseDeviceGPS}
            disabled={locating}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1E3A5F] bg-white border border-[#CBD5E1] rounded hover:bg-[#E9EEF5] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
            <span>{locating ? 'Reading GPS...' : 'Capture Current GPS'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Latitude (N)</label>
          <input
            type="number"
            step="0.00001"
            inputMode="decimal"
            value={safeLat}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0, safeLng, radiusMeters)}
            className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Longitude (E)</label>
          <input
            type="number"
            step="0.00001"
            inputMode="decimal"
            value={safeLng}
            onChange={(e) => onChange(safeLat, parseFloat(e.target.value) || 0, radiusMeters)}
            className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
          />
        </div>
        {showRadiusControl ? (
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Allowed Radius (m)
            </label>
            <input
              type="number"
              min={15}
              max={500}
              inputMode="numeric"
              value={radiusMeters}
              onChange={(e) =>
                onChange(safeLat, safeLng, Math.max(15, parseInt(e.target.value, 10) || 50))
              }
              className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
            />
          </div>
        ) : (
          <div className="flex flex-col justify-end">
            <div className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#E9EEF5] text-[#475569] rounded border border-[#CBD5E1]">
              {safeLat.toFixed(5)}° N, {safeLng.toFixed(5)}° E
            </div>
          </div>
        )}
      </div>

      {/* Live MapLibre + OpenFreeMap Click-on-Map Picker */}
      <GoogleMap
        apiKey={apiKey}
        markers={[
          {
            id: 'picker-pin',
            lat: safeLat,
            lng: safeLng,
            label,
            sub: `Geofence radius: ${radiusMeters} m`,
            kind: showRadiusControl ? 'shop' : 'distributor',
          },
        ]}
        circles={[{ lat: safeLat, lng: safeLng, radius: radiusMeters, color: '#2563EB' }]}
        onMapClick={handleMapPick}
        defaultCenter={{ lat: safeLat, lng: safeLng }}
        defaultZoom={15}
        height={height}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#475569]">
        <span>
          Click anywhere on the OpenFreeMap view or drag the pin to position coordinates · Geofence {radiusMeters}m
        </span>
        <span className="font-mono tabular-nums text-[#0F172A]">
          {safeLat.toFixed(5)}, {safeLng.toFixed(5)}
        </span>
      </div>

      {geoMessage && <p className="text-xs font-medium text-[#1E3A5F]">{geoMessage}</p>}
    </div>
  );
}
