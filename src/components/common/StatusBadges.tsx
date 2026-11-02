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
  Layers,
  Navigation,
  Crosshair,
} from 'lucide-react';
import { GPSVerificationStatus, EntityStatus, RoleSurface } from '../../types/infrastructure';

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
  if (surface === 'Web Dashboard') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1E3A5F] whitespace-nowrap shrink-0">
        <Monitor className="w-3.5 h-3.5 text-[#2563EB] shrink-0" aria-hidden="true" />
        <span>Web Dashboard</span>
      </span>
    );
  }
  if (surface === 'Mobile PWA') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 whitespace-nowrap shrink-0">
        <Smartphone className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
        <span>Mobile PWA</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F172A] whitespace-nowrap shrink-0">
      <Layers className="w-3.5 h-3.5 text-[#1E3A5F] shrink-0" aria-hidden="true" />
      <span>Dual (Web + Mobile)</span>
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
}

/**
 * Shared Coordinates Picker Component (Design System Section 5):
 * Lat/Lng inputs plus interactive "Pick on map" and an always-visible map preview after save.
 */
export function CoordinatesPicker({
  lat,
  lng,
  radiusMeters = 50,
  onChange,
  label = 'Registered Master Coordinates',
  showRadiusControl = false,
}: CoordinatesPickerProps) {
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width; // 0..1
    const relY = (e.clientY - rect.top) / rect.height; // 0..1
    // Map relative click around current region center (+/- 0.02 deg)
    const nextLat = Number((lat + (0.5 - relY) * 0.015).toFixed(4));
    const nextLng = Number((lng + (relX - 0.5) * 0.015).toFixed(4));
    onChange(nextLat, nextLng, radiusMeters);
    setGeoMessage('Pin updated on interactive coordinate grid.');
  };

  const handleUseDeviceGPS = () => {
    if (!navigator.geolocation) {
      setGeoMessage('Browser geolocation unavailable in this environment; click map grid to position pin.');
      return;
    }
    setLocating(true);
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange(
          Number(pos.coords.latitude.toFixed(4)),
          Number(pos.coords.longitude.toFixed(4)),
          radiusMeters
        );
        setGeoMessage(`Captured GPS (±${Math.round(pos.coords.accuracy)}m accuracy).`);
      },
      () => {
        setLocating(false);
        setGeoMessage('GPS permission declined or unavailable; click anywhere on the map preview to set pin.');
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  // Compute deterministic pin position within the preview box
  const offsetX = Math.max(18, Math.min(82, 50 + ((lng * 1000) % 25)));
  const offsetY = Math.max(20, Math.min(80, 50 - ((lat * 1000) % 25)));

  return (
    <div className="border border-[#CBD5E1] rounded-lg p-3.5 bg-[#F8FAFC] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#0F172A]">{label}</span>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Latitude (N)</label>
          <input
            type="number"
            step="0.0001"
            inputMode="decimal"
            value={lat}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0, lng, radiusMeters)}
            className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Longitude (E)</label>
          <input
            type="number"
            step="0.0001"
            inputMode="decimal"
            value={lng}
            onChange={(e) => onChange(lat, parseFloat(e.target.value) || 0, radiusMeters)}
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
              max={250}
              inputMode="numeric"
              value={radiusMeters}
              onChange={(e) =>
                onChange(lat, lng, Math.max(15, parseInt(e.target.value, 10) || 50))
              }
              className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
            />
          </div>
        ) : (
          <div className="flex flex-col justify-end">
            <div className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#E9EEF5] text-[#475569] rounded border border-[#CBD5E1]">
              {lat.toFixed(4)}° N, {lng.toFixed(4)}° E
            </div>
          </div>
        )}
      </div>

      {/* Always-visible interactive Map Preview */}
      <div className="relative rounded-md overflow-hidden border border-[#CBD5E1] bg-[#E9EEF5]">
        <svg
          viewBox="0 0 320 130"
          onClick={handleMapClick}
          className="w-full h-32 cursor-crosshair select-none block"
          role="img"
          aria-label="Interactive coordinate map picker. Click anywhere to reposition the pin."
        >
          {/* Swiss cartographic grid background */}
          <rect width="320" height="130" fill="#EDF2F7" />
          <g stroke="#CBD5E1" strokeWidth="0.75">
            <line x1="0" y1="26" x2="320" y2="26" />
            <line x1="0" y1="52" x2="320" y2="52" />
            <line x1="0" y1="78" x2="320" y2="78" />
            <line x1="0" y1="104" x2="320" y2="104" />
            <line x1="64" y1="0" x2="64" y2="130" />
            <line x1="128" y1="0" x2="128" y2="130" />
            <line x1="192" y1="0" x2="192" y2="130" />
            <line x1="256" y1="0" x2="256" y2="130" />
          </g>
          {/* Stylized arterial roads & blocks */}
          <path
            d="M 0 92 Q 110 68 210 54 T 320 28"
            stroke="#FFFFFF"
            strokeWidth="6"
            fill="none"
          />
          <path
            d="M 0 92 Q 110 68 210 54 T 320 28"
            stroke="#94A3B8"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            fill="none"
          />
          <path d="M 95 0 L 145 130" stroke="#FFFFFF" strokeWidth="4" fill="none" />
          <path d="M 225 0 L 195 130" stroke="#FFFFFF" strokeWidth="3.5" fill="none" />

          {/* Allowed Radius Geofence Circle */}
          <circle
            cx={(offsetX / 100) * 320}
            cy={(offsetY / 100) * 130}
            r={Math.min(42, Math.max(14, radiusMeters * 0.42))}
            fill="rgba(37, 99, 235, 0.14)"
            stroke="#2563EB"
            strokeWidth="1.25"
            strokeDasharray="3 2"
          />

          {/* Registered Pin */}
          <circle
            cx={(offsetX / 100) * 320}
            cy={(offsetY / 100) * 130}
            r="6"
            fill="#1E3A5F"
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        </svg>
        <div className="flex items-center justify-between px-2.5 py-1 bg-white/95 border-t border-[#CBD5E1] text-[11px] text-[#475569]">
          <span className="inline-flex items-center gap-1">
            <Navigation className="w-3 h-3 text-[#1E3A5F]" aria-hidden="true" />
            <span>Click map to adjust pin · Geofence {radiusMeters}m</span>
          </span>
          <span className="font-mono tabular-nums text-[#0F172A]">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        </div>
      </div>

      {geoMessage && <p className="text-xs text-[#475569]">{geoMessage}</p>}
    </div>
  );
}
