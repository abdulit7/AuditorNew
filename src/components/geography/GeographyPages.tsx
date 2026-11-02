import React, { useState } from 'react';
import {
  Building2,
  Map,
  MapPin,
  Compass,
  Store,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  Edit3,
  RefreshCw,
  Phone,
  User,
  Check,
  X,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import {
  City,
  Territory,
  LocationItem,
  SubLocation,
  Shop,
  AppUser,
  ActivePageId,
  GeographyFilterState,
  GPSVerificationStatus,
} from '../../types/infrastructure';
import {
  GPSStatusChip,
  EntityStatusIndicator,
  CoordinatesPicker,
} from '../common/StatusBadges';

interface GeographyPagesProps {
  activePage: 'cities' | 'territories' | 'locations' | 'sublocations' | 'shops';
  onNavigate: (page: ActivePageId) => void;
  geoFilter: GeographyFilterState;
  setGeoFilter: React.Dispatch<React.SetStateAction<GeographyFilterState>>;
  cities: City[];
  setCities: React.Dispatch<React.SetStateAction<City[]>>;
  territories: Territory[];
  setTerritories: React.Dispatch<React.SetStateAction<Territory[]>>;
  locations: LocationItem[];
  setLocations: React.Dispatch<React.SetStateAction<LocationItem[]>>;
  subLocations: SubLocation[];
  setSubLocations: React.Dispatch<React.SetStateAction<SubLocation[]>>;
  shops: Shop[];
  setShops: React.Dispatch<React.SetStateAction<Shop[]>>;
  users: AppUser[];
  onToast: (message: string) => void;
}

export function GeographyPages({
  activePage,
  onNavigate,
  geoFilter,
  setGeoFilter,
  cities,
  setCities,
  territories,
  setTerritories,
  locations,
  setLocations,
  subLocations,
  setSubLocations,
  shops,
  setShops,
  users,
  onToast,
}: GeographyPagesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [gpsStatusFilter, setGpsStatusFilter] = useState<string>('ALL');

  // Territory view state: selected territory for Tree + Map + Distributor card
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>(
    territories[0]?.id || 'ter-guj-01'
  );
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({
    'loc-guj-01': true,
    'loc-guj-02': true,
    'loc-lhr-01': true,
  });
  const [expandedSubLocations, setExpandedSubLocations] = useState<Record<string, boolean>>({
    'sub-guj-01': true,
    'sub-guj-03': true,
  });

  // Change Distributor Modal state
  const [changingDistributorTerritory, setChangingDistributorTerritory] =
    useState<Territory | null>(null);
  const [newDistName, setNewDistName] = useState('');
  const [newDistCode, setNewDistCode] = useState('');

  // Add/Edit Modals for each geography level
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);

  const [territoryModalOpen, setTerritoryModalOpen] = useState(false);
  const [editingTerritory, setEditingTerritory] = useState<Territory | null>(null);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);

  const [subLocationModalOpen, setSubLocationModalOpen] = useState(false);
  const [editingSubLocation, setEditingSubLocation] = useState<SubLocation | null>(null);

  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);

  // Helpers to look up parent names
  const getCity = (id: string) => cities.find((c) => c.id === id);
  const getTerritory = (id: string) => territories.find((t) => t.id === id);
  const getLocation = (id: string) => locations.find((l) => l.id === id);
  const getSubLocation = (id: string) => subLocations.find((s) => s.id === id);

  // Drill-down helper
  const drillToTerritories = (cityId: string) => {
    setGeoFilter({ cityId, territoryId: '', locationId: '', subLocationId: '' });
    const firstTer = territories.find((t) => t.cityId === cityId);
    if (firstTer) setSelectedTerritoryId(firstTer.id);
    onNavigate('territories');
  };

  const drillToLocations = (cityId: string, territoryId: string) => {
    setGeoFilter({ cityId, territoryId, locationId: '', subLocationId: '' });
    onNavigate('locations');
  };

  const drillToSubLocations = (cityId: string, territoryId: string, locationId: string) => {
    setGeoFilter({ cityId, territoryId, locationId, subLocationId: '' });
    onNavigate('sublocations');
  };

  const drillToShops = (
    cityId: string,
    territoryId: string,
    locationId: string,
    subLocationId: string
  ) => {
    setGeoFilter({ cityId, territoryId, locationId, subLocationId });
    onNavigate('shops');
  };

  // Level Switcher Tabs + Breadcrumb Bar
  const renderGeographyHeader = () => {
    const activeCity = geoFilter.cityId ? getCity(geoFilter.cityId) : null;
    const activeTerritory = geoFilter.territoryId ? getTerritory(geoFilter.territoryId) : null;
    const activeLocation = geoFilter.locationId ? getLocation(geoFilter.locationId) : null;
    const activeSubLocation = geoFilter.subLocationId
      ? getSubLocation(geoFilter.subLocationId)
      : null;

    return (
      <div className="mb-5">
        {/* Active Hierarchy Breadcrumb & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#E9EEF5]/60 border border-[#CBD5E1] rounded-lg text-xs">
          <div className="flex flex-wrap items-center gap-1.5 text-[#475569]">
            <span className="font-semibold text-[#0F172A]">Hierarchy Scope:</span>
            <button
              onClick={() => {
                setGeoFilter({ cityId: '', territoryId: '', locationId: '', subLocationId: '' });
                onNavigate('cities');
              }}
              className="hover:text-[#2563EB] font-medium cursor-pointer"
            >
              All Pakistan ({cities.length} Cities)
            </button>
            {activeCity && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
                <button
                  onClick={() => drillToTerritories(activeCity.id)}
                  className="font-medium text-[#1E3A5F] hover:underline cursor-pointer"
                >
                  <span className="font-mono">{activeCity.code}</span> · {activeCity.name}
                </button>
              </>
            )}
            {activeTerritory && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
                <button
                  onClick={() => drillToLocations(activeTerritory.cityId, activeTerritory.id)}
                  className="font-medium text-[#1E3A5F] hover:underline cursor-pointer"
                >
                  <span className="font-mono">{activeTerritory.code}</span> · {activeTerritory.name}
                </button>
              </>
            )}
            {activeLocation && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
                <button
                  onClick={() =>
                    drillToSubLocations(
                      activeLocation.cityId,
                      activeLocation.territoryId,
                      activeLocation.id
                    )
                  }
                  className="font-medium text-[#1E3A5F] hover:underline cursor-pointer"
                >
                  <span className="font-mono">{activeLocation.code}</span> · {activeLocation.name}
                </button>
              </>
            )}
            {activeSubLocation && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
                <span className="font-semibold text-[#0F172A]">
                  <span className="font-mono">{activeSubLocation.code}</span> ·{' '}
                  {activeSubLocation.name}
                </span>
              </>
            )}
          </div>

          {/* Cascading Quick Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by City"
              value={geoFilter.cityId}
              onChange={(e) =>
                setGeoFilter({
                  cityId: e.target.value,
                  territoryId: '',
                  locationId: '',
                  subLocationId: '',
                })
              }
              className="px-2.5 py-1 text-xs bg-white border border-[#CBD5E1] rounded text-[#0F172A] focus-ring"
            >
              <option value="">All Cities</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by Territory"
              value={geoFilter.territoryId}
              onChange={(e) => {
                const terId = e.target.value;
                const ter = getTerritory(terId);
                setGeoFilter((prev) => ({
                  cityId: ter ? ter.cityId : prev.cityId,
                  territoryId: terId,
                  locationId: '',
                  subLocationId: '',
                }));
              }}
              className="px-2.5 py-1 text-xs bg-white border border-[#CBD5E1] rounded text-[#0F172A] focus-ring"
            >
              <option value="">All Territories</option>
              {territories
                .filter((t) => !geoFilter.cityId || t.cityId === geoFilter.cityId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // 1. CITIES PAGE
  // ============================================================================
  if (activePage === 'cities') {
    const filteredCities = cities.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.region.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const openNewCityModal = () => {
      setEditingCity({
        id: `city-${Date.now()}`,
        code: '',
        name: '',
        province: 'Punjab',
        region: 'Central Belt',
        lat: 31.5204,
        lng: 74.3587,
        status: 'Active',
        createdAt: new Date().toISOString().slice(0, 10),
      });
      setCityModalOpen(true);
    };

    const handleSaveCity = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingCity || !editingCity.code.trim() || !editingCity.name.trim()) return;
      const exists = cities.some((c) => c.id === editingCity.id);
      if (exists) {
        setCities((prev) => prev.map((c) => (c.id === editingCity.id ? editingCity : c)));
        onToast(`Updated city ${editingCity.code} (${editingCity.name}).`);
      } else {
        setCities((prev) => [...prev, editingCity]);
        onToast(`Added new city ${editingCity.code} (${editingCity.name}).`);
      }
      setCityModalOpen(false);
    };

    return (
      <div>
        {renderGeographyHeader()}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Cities Master Directory</h1>
            <p className="text-sm text-[#475569]">
              Top-level regional hubs governing territories, distributor networks, and retail shop clusters.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search city or code (GUJ)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-64"
              />
            </div>
            <button
              onClick={openNewCityModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add City</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                  <th className="py-2.5 px-3">City Code</th>
                  <th className="py-2.5 px-3">City Name</th>
                  <th className="py-2.5 px-3">Province / Belt</th>
                  <th className="py-2.5 px-3 text-right">Territories</th>
                  <th className="py-2.5 px-3 text-right">Locations</th>
                  <th className="py-2.5 px-3 text-right">Sub-locations</th>
                  <th className="py-2.5 px-3 text-right">Retail Shops</th>
                  <th className="py-2.5 px-3">Center GPS</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {filteredCities.map((city) => {
                  const terCount = territories.filter((t) => t.cityId === city.id).length;
                  const locCount = locations.filter((l) => l.cityId === city.id).length;
                  const subCount = subLocations.filter((s) => s.cityId === city.id).length;
                  const shopCount = shops.filter((s) => s.cityId === city.id).length;

                  return (
                    <tr
                      key={city.id}
                      className="hover:bg-[#F8FAFC] transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums">
                        {city.code}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{city.name}</td>
                      <td className="py-2.5 px-3 text-[#475569]">
                        {city.province} · {city.region}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{terCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{locCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{subCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-[#0F172A]">
                        {shopCount}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-[#475569] tabular-nums">
                        {city.lat.toFixed(4)}, {city.lng.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3">
                        <EntityStatusIndicator status={city.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => drillToTerritories(city.id)}
                            className="px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/10 rounded transition-colors cursor-pointer whitespace-nowrap"
                          >
                            View Territories →
                          </button>
                          <button
                            onClick={() => {
                              setEditingCity(city);
                              setCityModalOpen(true);
                            }}
                            aria-label={`Edit ${city.name}`}
                            className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit City Modal */}
        {cityModalOpen && editingCity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="city-modal-title"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-lg w-full p-6 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
                <h2 id="city-modal-title" className="text-lg font-bold text-[#0F172A]">
                  {cities.some((c) => c.id === editingCity.id) ? 'Edit City Master' : 'Add New City'}
                </h2>
                <button
                  onClick={() => setCityModalOpen(false)}
                  aria-label="Close modal"
                  className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveCity} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      City Code (3-Letter ISO/Audit Code)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      placeholder="e.g. SKT"
                      value={editingCity.code}
                      onChange={(e) =>
                        setEditingCity({ ...editingCity, code: e.target.value.toUpperCase() })
                      }
                      className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      City Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sialkot"
                      value={editingCity.name}
                      onChange={(e) => setEditingCity({ ...editingCity, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Province
                    </label>
                    <select
                      value={editingCity.province}
                      onChange={(e) => setEditingCity({ ...editingCity, province: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    >
                      <option value="Punjab">Punjab</option>
                      <option value="Sindh">Sindh</option>
                      <option value="KPK">KPK</option>
                      <option value="Islamabad Capital">Islamabad Capital</option>
                      <option value="Balochistan">Balochistan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Operational Region
                    </label>
                    <input
                      type="text"
                      required
                      value={editingCity.region}
                      onChange={(e) => setEditingCity({ ...editingCity, region: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                </div>

                <CoordinatesPicker
                  lat={editingCity.lat}
                  lng={editingCity.lng}
                  label="City Center Coordinates"
                  onChange={(lat, lng) => setEditingCity({ ...editingCity, lat, lng })}
                />

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setCityModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                  >
                    Save City
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 2. TERRITORIES PAGE (Tree View + Map + Active Distributor Card + Table)
  // ============================================================================
  if (activePage === 'territories') {
    const visibleTerritories = territories.filter(
      (t) =>
        (!geoFilter.cityId || t.cityId === geoFilter.cityId) &&
        (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.distributorName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const activeTerritory =
      territories.find((t) => t.id === selectedTerritoryId) || visibleTerritories[0] || territories[0];
    const territoryLocations = locations.filter((l) => l.territoryId === activeTerritory?.id);
    const territoryShops = shops.filter((s) => s.territoryId === activeTerritory?.id);

    const openNewTerritoryModal = () => {
      const defaultCityId = geoFilter.cityId || cities[0]?.id || 'city-guj';
      const cityObj = getCity(defaultCityId);
      setEditingTerritory({
        id: `ter-${Date.now()}`,
        code: `${cityObj?.code || 'GUJ'}-T0${territories.length + 1}`,
        name: '',
        cityId: defaultCityId,
        distributorName: '',
        distributorCode: `DST-${cityObj?.code || 'GUJ'}-0${territories.length + 1}`,
        assignedAuditorIds: ['usr-03'],
        lat: cityObj?.lat || 32.1665,
        lng: cityObj?.lng || 74.1902,
        status: 'Active',
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      setTerritoryModalOpen(true);
    };

    const handleSaveTerritory = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTerritory || !editingTerritory.code.trim() || !editingTerritory.name.trim()) return;
      const exists = territories.some((t) => t.id === editingTerritory.id);
      if (exists) {
        setTerritories((prev) =>
          prev.map((t) => (t.id === editingTerritory.id ? editingTerritory : t))
        );
        onToast(`Updated territory ${editingTerritory.code}.`);
      } else {
        setTerritories((prev) => [...prev, editingTerritory]);
        setSelectedTerritoryId(editingTerritory.id);
        onToast(`Created territory ${editingTerritory.code}.`);
      }
      setTerritoryModalOpen(false);
    };

    const handleConfirmChangeDistributor = (e: React.FormEvent) => {
      e.preventDefault();
      if (!changingDistributorTerritory || !newDistName.trim()) return;
      setTerritories((prev) =>
        prev.map((t) =>
          t.id === changingDistributorTerritory.id
            ? {
                ...t,
                distributorName: newDistName.trim(),
                distributorCode: newDistCode.trim() || t.distributorCode,
                updatedAt: new Date().toISOString().slice(0, 10),
              }
            : t
        )
      );
      onToast(
        `Reassigned ${changingDistributorTerritory.code} to ${newDistName.trim()}. Geography hierarchy & shop history preserved.`
      );
      setChangingDistributorTerritory(null);
    };

    return (
      <div>
        {renderGeographyHeader()}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">
              Territories & Geography Tree Explorer
            </h1>
            <p className="text-sm text-[#475569]">
              Inspect Territory → Location → Sub-location → Shop trees beside the active distributor card and spatial map.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search code (GUJ-T01) or distributor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-64"
              />
            </div>
            <button
              onClick={openNewTerritoryModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Territory</span>
            </button>
          </div>
        </div>

        {/* Design System Section 5: Territory Tree View beside Map & Active Distributor Card */}
        {activeTerritory && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 items-stretch">
            {/* Left 7 Cols: Interactive Territory -> Location -> Sub-location -> Shop Tree */}
            <div className="lg:col-span-7 bg-white border border-[#CBD5E1] rounded-lg p-5 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[#CBD5E1]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                      {activeTerritory.code}
                    </span>
                    <h2 className="text-base font-bold text-[#0F172A]">{activeTerritory.name}</h2>
                  </div>
                  <select
                    aria-label="Select Territory to Inspect in Tree"
                    value={activeTerritory.id}
                    onChange={(e) => setSelectedTerritoryId(e.target.value)}
                    className="px-2.5 py-1 text-xs font-medium bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[#0F172A] focus-ring"
                  >
                    {territories.map((t) => (
                      <option key={t.id} value={t.id}>
                        Switch Tree: {t.code} ({t.name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hierarchy Tree Nodes */}
                <div className="space-y-2.5">
                  {territoryLocations.length === 0 ? (
                    <div className="p-6 text-center bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-lg">
                      <p className="text-sm text-[#475569] mb-2">
                        No locations registered under {activeTerritory.code} yet.
                      </p>
                      <button
                        onClick={() => drillToLocations(activeTerritory.cityId, activeTerritory.id)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-[#1E3A5F] rounded cursor-pointer"
                      >
                        Add First Location to {activeTerritory.code}
                      </button>
                    </div>
                  ) : (
                    territoryLocations.map((loc) => {
                      const isLocOpen = expandedLocations[loc.id] ?? true;
                      const locSubs = subLocations.filter((s) => s.locationId === loc.id);
                      return (
                        <div
                          key={loc.id}
                          className="border border-[#CBD5E1] rounded-lg overflow-hidden"
                        >
                          <div className="flex items-center justify-between px-3 py-2 bg-[#F8FAFC]">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLocations((prev) => ({
                                  ...prev,
                                  [loc.id]: !isLocOpen,
                                }))
                              }
                              className="flex items-center gap-2 text-left text-sm font-semibold text-[#0F172A] cursor-pointer"
                            >
                              {isLocOpen ? (
                                <ChevronDown className="w-4 h-4 text-[#475569]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-[#475569]" />
                              )}
                              <Compass className="w-4 h-4 text-[#1E3A5F]" />
                              <span className="font-mono text-xs text-[#1E3A5F]">{loc.code}</span>
                              <span>{loc.name}</span>
                            </button>
                            <div className="flex items-center gap-2 text-xs text-[#475569]">
                              <span>{loc.areaClassification}</span>
                              <span>·</span>
                              <button
                                onClick={() =>
                                  drillToSubLocations(loc.cityId, loc.territoryId, loc.id)
                                }
                                className="text-[#2563EB] hover:underline font-medium cursor-pointer"
                              >
                                {locSubs.length} Sub-locations
                              </button>
                            </div>
                          </div>

                          {isLocOpen && (
                            <div className="p-3 pl-7 space-y-2 bg-white border-t border-[#CBD5E1]">
                              {locSubs.map((sub) => {
                                const isSubOpen = expandedSubLocations[sub.id] ?? true;
                                const subShops = shops.filter((sh) => sh.subLocationId === sub.id);
                                return (
                                  <div
                                    key={sub.id}
                                    className="border border-[#CBD5E1] rounded-md p-2.5 bg-[#F8FAFC]/60"
                                  >
                                    <div className="flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedSubLocations((prev) => ({
                                            ...prev,
                                            [sub.id]: !isSubOpen,
                                          }))
                                        }
                                        className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] cursor-pointer"
                                      >
                                        {isSubOpen ? (
                                          <ChevronDown className="w-3.5 h-3.5 text-[#475569]" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
                                        )}
                                        <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                                        <span className="font-mono text-[#1E3A5F]">{sub.code}</span>
                                        <span>{sub.name}</span>
                                      </button>
                                      <button
                                        onClick={() =>
                                          drillToShops(
                                            sub.cityId,
                                            sub.territoryId,
                                            sub.locationId,
                                            sub.id
                                          )
                                        }
                                        className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                                      >
                                        {subShops.length} Shops →
                                      </button>
                                    </div>

                                    {isSubOpen && subShops.length > 0 && (
                                      <div className="mt-2 pl-5 space-y-1.5 border-t border-[#CBD5E1]/70 pt-2">
                                        {subShops.map((shop) => (
                                          <div
                                            key={shop.id}
                                            className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white px-2.5 py-1.5 rounded border border-[#CBD5E1]"
                                          >
                                            <div className="flex items-center gap-2">
                                              <Store className="w-3.5 h-3.5 text-[#475569]" />
                                              <span className="font-mono font-medium text-[#1E3A5F]">
                                                {shop.code}
                                              </span>
                                              <span className="font-medium text-[#0F172A]">
                                                {shop.name}
                                              </span>
                                            </div>
                                            <GPSStatusChip status={shop.gpsStatus} />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569]">
                <span>
                  Tree Summary: <strong className="font-mono text-[#0F172A]">{territoryLocations.length}</strong> Locations ·{' '}
                  <strong className="font-mono text-[#0F172A]">
                    {subLocations.filter((s) => s.territoryId === activeTerritory.id).length}
                  </strong>{' '}
                  Sub-locations ·{' '}
                  <strong className="font-mono text-[#0F172A]">{territoryShops.length}</strong>{' '}
                  Registered Shops
                </span>
                <button
                  onClick={() => drillToLocations(activeTerritory.cityId, activeTerritory.id)}
                  className="font-medium text-[#2563EB] hover:underline cursor-pointer"
                >
                  Manage Locations in {activeTerritory.code} →
                </button>
              </div>
            </div>

            {/* Right 5 Cols: Active Distributor Card ("Change distributor") + Spatial Territory Map */}
            <div className="lg:col-span-5 flex flex-col gap-4 justify-between">
              {/* Active Distributor Card */}
              <div className="bg-white border border-[#CBD5E1] rounded-lg p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-[#475569]">
                      Active Territory Distributor
                    </span>
                    <h3 className="text-lg font-bold text-[#0F172A] mt-0.5">
                      {activeTerritory.distributorName}
                    </h3>
                    <p className="text-xs font-mono text-[#1E3A5F] mt-0.5">
                      Code: {activeTerritory.distributorCode} · Bound to {activeTerritory.code}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setChangingDistributorTerritory(activeTerritory);
                      setNewDistName(activeTerritory.distributorName);
                      setNewDistCode(activeTerritory.distributorCode);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] bg-[#F8FAFC] border border-[#CBD5E1] rounded-md hover:bg-[#E9EEF5] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>Change distributor</span>
                  </button>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Changing the active distributor ends the current distributor assignment and binds the new distributor while keeping the entire geography tree ({territoryLocations.length} locations, {territoryShops.length} shops) intact.
                </p>
                <div className="pt-2 border-t border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#475569]">Assigned Field Auditors:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeTerritory.assignedAuditorIds.map((uid) => {
                      const u = users.find((usr) => usr.id === uid);
                      return u ? (
                        <span
                          key={uid}
                          className="font-mono text-[11px] bg-[#E9EEF5] text-[#0F172A] px-2 py-0.5 rounded"
                        >
                          {u.code} · {u.fullName.split(' ')[0]}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>

              {/* Territory Spatial Coverage Map */}
              <div className="bg-white border border-[#CBD5E1] rounded-lg p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#0F172A]">
                    Territory Spatial Footprint ({activeTerritory.code})
                  </span>
                  <span className="font-mono text-xs text-[#475569] tabular-nums">
                    {activeTerritory.lat.toFixed(4)}° N, {activeTerritory.lng.toFixed(4)}° E
                  </span>
                </div>
                <div className="relative rounded border border-[#CBD5E1] bg-[#EDF2F7] overflow-hidden flex-1 min-h-[170px]">
                  <svg
                    viewBox="0 0 360 170"
                    className="w-full h-full block"
                    role="img"
                    aria-label={`Map showing locations and shops in ${activeTerritory.code}`}
                  >
                    <rect width="360" height="170" fill="#EDF2F7" />
                    <g stroke="#CBD5E1" strokeWidth="0.75">
                      <line x1="0" y1="42" x2="360" y2="42" />
                      <line x1="0" y1="85" x2="360" y2="85" />
                      <line x1="0" y1="128" x2="360" y2="128" />
                      <line x1="90" y1="0" x2="90" y2="170" />
                      <line x1="180" y1="0" x2="180" y2="170" />
                      <line x1="270" y1="0" x2="270" y2="170" />
                    </g>
                    {/* Territory Boundary Polygon */}
                    <polygon
                      points="45,30 305,22 325,138 65,148"
                      fill="rgba(30, 58, 95, 0.08)"
                      stroke="#1E3A5F"
                      strokeWidth="1.5"
                      strokeDasharray="5 3"
                    />
                    {/* Plot shops inside territory */}
                    {territoryShops.map((sh, idx) => {
                      const cx = 95 + ((idx * 67) % 190);
                      const cy = 50 + ((idx * 43) % 75);
                      const isVerified = sh.gpsStatus === 'GPS Verified';
                      return (
                        <g key={sh.id}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r="12"
                            fill={
                              isVerified
                                ? 'rgba(22, 163, 74, 0.16)'
                                : 'rgba(180, 83, 9, 0.18)'
                            }
                          />
                          <circle
                            cx={cx}
                            cy={cy}
                            r="4.5"
                            fill={isVerified ? '#16A34A' : '#B45309'}
                            stroke="#FFFFFF"
                            strokeWidth="1.5"
                          />
                          <text
                            x={cx + 7}
                            y={cy + 3}
                            fontSize="9"
                            fontFamily="Fira Code, monospace"
                            fill="#0F172A"
                            fontWeight="600"
                          >
                            {sh.code}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#475569] mt-2">
                  <span>Dashed perimeter: {activeTerritory.code} geofence zone</span>
                  <span>{territoryShops.length} active retail points plotted</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Territories Master Table */}
        <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#CBD5E1] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F172A]">All Territories Register</h3>
            <span className="text-xs text-[#475569]">
              Click any row to load its tree & map above
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                  <th className="py-2.5 px-3">Territory Code</th>
                  <th className="py-2.5 px-3">Territory Name</th>
                  <th className="py-2.5 px-3">City</th>
                  <th className="py-2.5 px-3">Active Distributor</th>
                  <th className="py-2.5 px-3 text-right">Locations</th>
                  <th className="py-2.5 px-3 text-right">Shops</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {visibleTerritories.map((ter) => {
                  const city = getCity(ter.cityId);
                  const locCount = locations.filter((l) => l.territoryId === ter.id).length;
                  const shopCount = shops.filter((s) => s.territoryId === ter.id).length;
                  const isSelected = activeTerritory?.id === ter.id;

                  return (
                    <tr
                      key={ter.id}
                      onClick={() => setSelectedTerritoryId(ter.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#2563EB]/[0.06]' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums">
                        {ter.code}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{ter.name}</td>
                      <td className="py-2.5 px-3 text-[#475569]">
                        <span className="font-mono text-xs">{city?.code}</span> · {city?.name}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#0F172A]">{ter.distributorName}</div>
                        <div className="font-mono text-xs text-[#475569]">{ter.distributorCode}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{locCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">
                        {shopCount}
                      </td>
                      <td className="py-2.5 px-3">
                        <EntityStatusIndicator status={ter.status} />
                      </td>
                      <td
                        className="py-2.5 px-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => drillToLocations(ter.cityId, ter.id)}
                            className="px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/10 rounded cursor-pointer whitespace-nowrap"
                          >
                            Locations →
                          </button>
                          <button
                            onClick={() => {
                              setEditingTerritory(ter);
                              setTerritoryModalOpen(true);
                            }}
                            aria-label={`Edit ${ter.name}`}
                            className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Change Distributor Confirm Modal (Design System Section 5 & 7) */}
        {changingDistributorTerritory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Change Territory Distributor ({changingDistributorTerritory.code})
                </h2>
                <button
                  onClick={() => setChangingDistributorTerritory(null)}
                  className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-3 bg-[#FEF3C7] border border-[#B45309]/30 rounded text-xs text-[#B45309]">
                <strong>What is kept:</strong> Ending the current assignment for{' '}
                <strong>{changingDistributorTerritory.distributorName}</strong> preserves the entire{' '}
                <span className="font-mono">{changingDistributorTerritory.code}</span> geography tree
                (Locations, Sub-locations, and Registered Shops) and all historical stock audit logs.
              </div>
              <form onSubmit={handleConfirmChangeDistributor} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    New Assigned Distributor Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newDistName}
                    onChange={(e) => setNewDistName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Distributor Master Code
                  </label>
                  <input
                    type="text"
                    required
                    value={newDistCode}
                    onChange={(e) => setNewDistCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setChangingDistributorTerritory(null)}
                    className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                  >
                    Confirm Distributor Reassignment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add/Edit Territory Modal */}
        {territoryModalOpen && editingTerritory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-lg w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {territories.some((t) => t.id === editingTerritory.id)
                    ? 'Edit Territory'
                    : 'Create Territory'}
                </h2>
                <button
                  onClick={() => setTerritoryModalOpen(false)}
                  className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveTerritory} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Parent City
                    </label>
                    <select
                      value={editingTerritory.cityId}
                      onChange={(e) =>
                        setEditingTerritory({ ...editingTerritory, cityId: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    >
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Territory Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editingTerritory.code}
                      onChange={(e) =>
                        setEditingTerritory({
                          ...editingTerritory,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Territory Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Gujranwala Cantt & Rahwali"
                      value={editingTerritory.name}
                      onChange={(e) =>
                        setEditingTerritory({ ...editingTerritory, name: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Assigned Distributor Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Punjab Star Logistics"
                      value={editingTerritory.distributorName}
                      onChange={(e) =>
                        setEditingTerritory({
                          ...editingTerritory,
                          distributorName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Distributor Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editingTerritory.distributorCode}
                      onChange={(e) =>
                        setEditingTerritory({
                          ...editingTerritory,
                          distributorCode: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                </div>

                <CoordinatesPicker
                  lat={editingTerritory.lat}
                  lng={editingTerritory.lng}
                  label="Territory Center Coordinates"
                  onChange={(lat, lng) => setEditingTerritory({ ...editingTerritory, lat, lng })}
                />

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setTerritoryModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                  >
                    Save Territory
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 3. LOCATIONS PAGE
  // ============================================================================
  if (activePage === 'locations') {
    const visibleLocations = locations.filter(
      (l) =>
        (!geoFilter.cityId || l.cityId === geoFilter.cityId) &&
        (!geoFilter.territoryId || l.territoryId === geoFilter.territoryId) &&
        (l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.code.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const openNewLocationModal = () => {
      const ter =
        getTerritory(geoFilter.territoryId) ||
        territories.find((t) => !geoFilter.cityId || t.cityId === geoFilter.cityId) ||
        territories[0];
      setEditingLocation({
        id: `loc-${Date.now()}`,
        code: `${ter.code}-L0${locations.filter((l) => l.territoryId === ter.id).length + 1}`,
        name: '',
        territoryId: ter.id,
        cityId: ter.cityId,
        areaClassification: 'Urban Commercial',
        lat: ter.lat,
        lng: ter.lng,
        status: 'Active',
      });
      setLocationModalOpen(true);
    };

    const handleSaveLocation = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingLocation || !editingLocation.code.trim() || !editingLocation.name.trim()) return;
      const exists = locations.some((l) => l.id === editingLocation.id);
      if (exists) {
        setLocations((prev) =>
          prev.map((l) => (l.id === editingLocation.id ? editingLocation : l))
        );
        onToast(`Updated location ${editingLocation.code}.`);
      } else {
        setLocations((prev) => [...prev, editingLocation]);
        onToast(`Added location ${editingLocation.code}.`);
      }
      setLocationModalOpen(false);
    };

    return (
      <div>
        {renderGeographyHeader()}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Locations Master (Level 3)</h1>
            <p className="text-sm text-[#475569]">
              Major municipal zones and wholesale mandis inside each territory, grouping sub-locations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search location code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-64"
              />
            </div>
            <button
              onClick={openNewLocationModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Location</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                  <th className="py-2.5 px-3">Location Code</th>
                  <th className="py-2.5 px-3">Location Name</th>
                  <th className="py-2.5 px-3">Parent Territory & City</th>
                  <th className="py-2.5 px-3">Classification</th>
                  <th className="py-2.5 px-3 text-right">Sub-locations</th>
                  <th className="py-2.5 px-3 text-right">Shops</th>
                  <th className="py-2.5 px-3">Coordinates</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {visibleLocations.map((loc) => {
                  const ter = getTerritory(loc.territoryId);
                  const city = getCity(loc.cityId);
                  const subCount = subLocations.filter((s) => s.locationId === loc.id).length;
                  const shopCount = shops.filter((s) => s.locationId === loc.id).length;

                  return (
                    <tr key={loc.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums">
                        {loc.code}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{loc.name}</td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">
                        <span className="font-mono text-[#0F172A] font-medium">{ter?.code}</span> ·{' '}
                        {city?.name}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">
                        {loc.areaClassification}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{subCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">
                        {shopCount}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-[#475569] tabular-nums">
                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3">
                        <EntityStatusIndicator status={loc.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => drillToSubLocations(loc.cityId, loc.territoryId, loc.id)}
                            className="px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/10 rounded cursor-pointer whitespace-nowrap"
                          >
                            Sub-locations →
                          </button>
                          <button
                            onClick={() => {
                              setEditingLocation(loc);
                              setLocationModalOpen(true);
                            }}
                            aria-label={`Edit ${loc.name}`}
                            className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit Location Modal */}
        {locationModalOpen && editingLocation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-lg w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {locations.some((l) => l.id === editingLocation.id)
                    ? 'Edit Location'
                    : 'Add Location'}
                </h2>
                <button
                  onClick={() => setLocationModalOpen(false)}
                  className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveLocation} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Parent Territory
                    </label>
                    <select
                      value={editingLocation.territoryId}
                      onChange={(e) => {
                        const ter = getTerritory(e.target.value);
                        if (ter) {
                          setEditingLocation({
                            ...editingLocation,
                            territoryId: ter.id,
                            cityId: ter.cityId,
                          });
                        }
                      }}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    >
                      {territories.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} — {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Location Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editingLocation.code}
                      onChange={(e) =>
                        setEditingLocation({
                          ...editingLocation,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Location Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Peoples Colony Commercial"
                      value={editingLocation.name}
                      onChange={(e) =>
                        setEditingLocation({ ...editingLocation, name: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Area Classification
                    </label>
                    <select
                      value={editingLocation.areaClassification}
                      onChange={(e) =>
                        setEditingLocation({
                          ...editingLocation,
                          areaClassification: e.target
                            .value as LocationItem['areaClassification'],
                        })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    >
                      <option value="Urban Commercial">Urban Commercial</option>
                      <option value="Wholesale Hub">Wholesale Hub</option>
                      <option value="Suburban Retail">Suburban Retail</option>
                      <option value="Industrial Belt">Industrial Belt</option>
                    </select>
                  </div>
                </div>

                <CoordinatesPicker
                  lat={editingLocation.lat}
                  lng={editingLocation.lng}
                  label="Location Center Coordinates"
                  onChange={(lat, lng) => setEditingLocation({ ...editingLocation, lat, lng })}
                />

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setLocationModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                  >
                    Save Location
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 4. SUB-LOCATIONS PAGE
  // ============================================================================
  if (activePage === 'sublocations') {
    const visibleSubLocations = subLocations.filter(
      (s) =>
        (!geoFilter.cityId || s.cityId === geoFilter.cityId) &&
        (!geoFilter.territoryId || s.territoryId === geoFilter.territoryId) &&
        (!geoFilter.locationId || s.locationId === geoFilter.locationId) &&
        (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.code.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const openNewSubLocationModal = () => {
      const loc =
        getLocation(geoFilter.locationId) ||
        locations.find((l) => !geoFilter.territoryId || l.territoryId === geoFilter.territoryId) ||
        locations[0];
      setEditingSubLocation({
        id: `sub-${Date.now()}`,
        code: `${loc.code}-SL0${subLocations.filter((s) => s.locationId === loc.id).length + 1}`,
        name: '',
        locationId: loc.id,
        territoryId: loc.territoryId,
        cityId: loc.cityId,
        marketType: 'Main Bazaar',
        postalCode: '52250',
        lat: loc.lat,
        lng: loc.lng,
        status: 'Active',
      });
      setSubLocationModalOpen(true);
    };

    const handleSaveSubLocation = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingSubLocation || !editingSubLocation.code.trim() || !editingSubLocation.name.trim())
        return;
      const exists = subLocations.some((s) => s.id === editingSubLocation.id);
      if (exists) {
        setSubLocations((prev) =>
          prev.map((s) => (s.id === editingSubLocation.id ? editingSubLocation : s))
        );
        onToast(`Updated sub-location ${editingSubLocation.code}.`);
      } else {
        setSubLocations((prev) => [...prev, editingSubLocation]);
        onToast(`Created sub-location ${editingSubLocation.code}.`);
      }
      setSubLocationModalOpen(false);
    };

    return (
      <div>
        {renderGeographyHeader()}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Sub-locations Master (Level 4)</h1>
            <p className="text-sm text-[#475569]">
              Granular bazaars, commercial lanes, and karyana clusters directly containing registered retail shops.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search sub-location code or bazaar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-64"
              />
            </div>
            <button
              onClick={openNewSubLocationModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Sub-location</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                  <th className="py-2.5 px-3">Sub-location Code</th>
                  <th className="py-2.5 px-3">Sub-location Name</th>
                  <th className="py-2.5 px-3">Parent Location & Territory</th>
                  <th className="py-2.5 px-3">Market Type</th>
                  <th className="py-2.5 px-3">Postal Code</th>
                  <th className="py-2.5 px-3 text-right">Registered Shops</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {visibleSubLocations.map((sub) => {
                  const loc = getLocation(sub.locationId);
                  const ter = getTerritory(sub.territoryId);
                  const shopCount = shops.filter((sh) => sh.subLocationId === sub.id).length;

                  return (
                    <tr key={sub.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums">
                        {sub.code}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{sub.name}</td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">
                        <span className="font-mono text-[#0F172A] font-medium">{loc?.code}</span> ·{' '}
                        {loc?.name} ({ter?.code})
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">{sub.marketType}</td>
                      <td className="py-2.5 px-3 font-mono text-xs text-[#475569] tabular-nums">
                        {sub.postalCode}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#0F172A]">
                        {shopCount}
                      </td>
                      <td className="py-2.5 px-3">
                        <EntityStatusIndicator status={sub.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() =>
                              drillToShops(sub.cityId, sub.territoryId, sub.locationId, sub.id)
                            }
                            className="px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/10 rounded cursor-pointer whitespace-nowrap"
                          >
                            View Shops ({shopCount}) →
                          </button>
                          <button
                            onClick={() => {
                              setEditingSubLocation(sub);
                              setSubLocationModalOpen(true);
                            }}
                            aria-label={`Edit ${sub.name}`}
                            className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit Sub-location Modal */}
        {subLocationModalOpen && editingSubLocation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-lg w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {subLocations.some((s) => s.id === editingSubLocation.id)
                    ? 'Edit Sub-location'
                    : 'Add Sub-location'}
                </h2>
                <button
                  onClick={() => setSubLocationModalOpen(false)}
                  className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveSubLocation} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Parent Location
                    </label>
                    <select
                      value={editingSubLocation.locationId}
                      onChange={(e) => {
                        const loc = getLocation(e.target.value);
                        if (loc) {
                          setEditingSubLocation({
                            ...editingSubLocation,
                            locationId: loc.id,
                            territoryId: loc.territoryId,
                            cityId: loc.cityId,
                          });
                        }
                      }}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    >
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code} — {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Sub-location Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editingSubLocation.code}
                      onChange={(e) =>
                        setEditingSubLocation({
                          ...editingSubLocation,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Market Type
                    </label>
                    <select
                      value={editingSubLocation.marketType}
                      onChange={(e) =>
                        setEditingSubLocation({
                          ...editingSubLocation,
                          marketType: e.target.value as SubLocation['marketType'],
                        })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    >
                      <option value="Main Bazaar">Main Bazaar</option>
                      <option value="Karyana Cluster">Karyana Cluster</option>
                      <option value="Commercial Strip">Commercial Strip</option>
                      <option value="Supermarket Zone">Supermarket Zone</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Sub-location Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Block C Main Bazaar"
                      value={editingSubLocation.name}
                      onChange={(e) =>
                        setEditingSubLocation({ ...editingSubLocation, name: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingSubLocation.postalCode}
                      onChange={(e) =>
                        setEditingSubLocation({ ...editingSubLocation, postalCode: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                </div>

                <CoordinatesPicker
                  lat={editingSubLocation.lat}
                  lng={editingSubLocation.lng}
                  label="Sub-location Center Coordinates"
                  onChange={(lat, lng) =>
                    setEditingSubLocation({ ...editingSubLocation, lat, lng })
                  }
                />

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setSubLocationModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                  >
                    Save Sub-location
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 5. SHOPS (RETAILER MASTER) PAGE
  // ============================================================================
  const visibleShops = shops.filter(
    (sh) =>
      (!geoFilter.cityId || sh.cityId === geoFilter.cityId) &&
      (!geoFilter.territoryId || sh.territoryId === geoFilter.territoryId) &&
      (!geoFilter.locationId || sh.locationId === geoFilter.locationId) &&
      (!geoFilter.subLocationId || sh.subLocationId === geoFilter.subLocationId) &&
      (gpsStatusFilter === 'ALL' || sh.gpsStatus === gpsStatusFilter) &&
      (sh.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sh.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sh.ownerName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const openNewShopModal = () => {
    const sub =
      getSubLocation(geoFilter.subLocationId) ||
      subLocations.find((s) => !geoFilter.locationId || s.locationId === geoFilter.locationId) ||
      subLocations[0];
    setEditingShop({
      id: `shp-${Date.now()}`,
      code: `SHP-${1050 + shops.length}`,
      name: '',
      ownerName: '',
      phone: '+92 300 ',
      subLocationId: sub.id,
      locationId: sub.locationId,
      territoryId: sub.territoryId,
      cityId: sub.cityId,
      shopCategory: 'Wholesale Karyana',
      lat: sub.lat,
      lng: sub.lng,
      allowedRadiusMeters: 50,
      gpsStatus: 'GPS Verified',
      gpsAccuracyMeters: 10,
      status: 'Active',
      lastVerifiedAt: new Date().toISOString().slice(0, 10),
      addressLine: '',
    });
    setShopModalOpen(true);
  };

  const handleSaveShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShop || !editingShop.code.trim() || !editingShop.name.trim()) return;
    const exists = shops.some((s) => s.id === editingShop.id);
    if (exists) {
      setShops((prev) => prev.map((s) => (s.id === editingShop.id ? editingShop : s)));
      onToast(`Updated shop ${editingShop.code} (${editingShop.name}).`);
    } else {
      setShops((prev) => [...prev, editingShop]);
      onToast(`Registered new shop ${editingShop.code} (${editingShop.name}).`);
    }
    setShopModalOpen(false);
  };

  return (
    <div>
      {renderGeographyHeader()}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Retailer Shops Master & Geofence Registry (Level 5)
          </h1>
          <p className="text-sm text-[#475569]">
            Registered retail outlets with master GPS coordinates, allowed radius thresholds, and verification status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by GPS Verification Status"
            value={gpsStatusFilter}
            onChange={(e) => setGpsStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
          >
            <option value="ALL">All GPS Statuses</option>
            <option value="GPS Verified">GPS Verified</option>
            <option value="Awaiting Verification">Awaiting Verification</option>
            <option value="Low GPS Accuracy">Low GPS Accuracy</option>
            <option value="Outside Allowed Radius">Outside Allowed Radius</option>
            <option value="Approved Exception">Approved Exception</option>
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search shop code, name, owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-64"
            />
          </div>
          <button
            onClick={openNewShopModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Register Shop</span>
          </button>
        </div>
      </div>

      {visibleShops.length === 0 ? (
        <div className="bg-white border border-[#CBD5E1] rounded-lg p-10 text-center space-y-3">
          <Store className="w-8 h-8 text-[#475569] mx-auto" />
          <div className="text-base font-semibold text-[#0F172A]">
            No shops yet in this filter scope.
          </div>
          <p className="text-sm text-[#475569]">
            Add the first shop to this sub-location or clear your active search filters.
          </p>
          <button
            onClick={openNewShopModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Shop to Sub-location</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                  <th className="py-2.5 px-3">Shop Code</th>
                  <th className="py-2.5 px-3">Shop Name & Category</th>
                  <th className="py-2.5 px-3">Retailer Contact</th>
                  <th className="py-2.5 px-3">Sub-location & Territory</th>
                  <th className="py-2.5 px-3">Registered GPS & Radius</th>
                  <th className="py-2.5 px-3">GPS Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {visibleShops.map((shop) => {
                  const sub = getSubLocation(shop.subLocationId);
                  const ter = getTerritory(shop.territoryId);

                  return (
                    <tr key={shop.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums">
                        {shop.code}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#0F172A]">{shop.name}</div>
                        <div className="text-xs text-[#475569]">
                          {shop.shopCategory} · {shop.addressLine}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-xs font-medium text-[#0F172A]">{shop.ownerName}</div>
                        <div className="font-mono text-xs text-[#475569] tabular-nums">
                          {shop.phone}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">
                        <div className="font-medium text-[#0F172A]">{sub?.name}</div>
                        <div className="font-mono">
                          {sub?.code} · {ter?.code}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs tabular-nums">
                        <div className="text-[#0F172A]">
                          {shop.lat.toFixed(4)}, {shop.lng.toFixed(4)}
                        </div>
                        <div className="text-[#475569]">
                          Geofence: {shop.allowedRadiusMeters}m
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <GPSStatusChip status={shop.gpsStatus} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            setEditingShop(shop);
                            setShopModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1E3A5F] bg-[#F8FAFC] border border-[#CBD5E1] rounded hover:bg-[#E9EEF5] cursor-pointer whitespace-nowrap"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>Edit & Map</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Shop Modal with Shared CoordinatesPicker */}
      {shopModalOpen && editingShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#CBD5E1] rounded-lg max-w-2xl w-full p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {shops.some((s) => s.id === editingShop.id)
                    ? `Edit Retailer Shop (${editingShop.code})`
                    : 'Register New Retailer Shop'}
                </h2>
                <p className="text-xs text-[#475569]">
                  Configure shop master metadata, sub-location binding, and GPS geofence coordinates.
                </p>
              </div>
              <button
                onClick={() => setShopModalOpen(false)}
                className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShop} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Parent Sub-location
                  </label>
                  <select
                    value={editingShop.subLocationId}
                    onChange={(e) => {
                      const sub = getSubLocation(e.target.value);
                      if (sub) {
                        setEditingShop({
                          ...editingShop,
                          subLocationId: sub.id,
                          locationId: sub.locationId,
                          territoryId: sub.territoryId,
                          cityId: sub.cityId,
                        });
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  >
                    {subLocations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Shop Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShop.code}
                    onChange={(e) =>
                      setEditingShop({ ...editingShop, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Shop Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Al-Barakah Cash & Carry"
                    value={editingShop.name}
                    onChange={(e) => setEditingShop({ ...editingShop, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Shop Category
                  </label>
                  <select
                    value={editingShop.shopCategory}
                    onChange={(e) =>
                      setEditingShop({
                        ...editingShop,
                        shopCategory: e.target.value as Shop['shopCategory'],
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  >
                    <option value="Wholesale Karyana">Wholesale Karyana</option>
                    <option value="General Store">General Store</option>
                    <option value="Modern Trade / Mart">Modern Trade / Mart</option>
                    <option value="Bakery & Dairy">Bakery & Dairy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Owner / Contact Person
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShop.ownerName}
                    onChange={(e) => setEditingShop({ ...editingShop, ownerName: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={editingShop.phone}
                    onChange={(e) => setEditingShop({ ...editingShop, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Street Address / Landmark
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShop.addressLine}
                    onChange={(e) =>
                      setEditingShop({ ...editingShop, addressLine: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Master GPS Verification Status
                  </label>
                  <select
                    value={editingShop.gpsStatus}
                    onChange={(e) =>
                      setEditingShop({
                        ...editingShop,
                        gpsStatus: e.target.value as GPSVerificationStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  >
                    <option value="GPS Verified">GPS Verified</option>
                    <option value="Awaiting Verification">Awaiting Verification</option>
                    <option value="Low GPS Accuracy">Low GPS Accuracy</option>
                    <option value="Outside Allowed Radius">Outside Allowed Radius</option>
                    <option value="Approved Exception">Approved Exception</option>
                  </select>
                </div>
              </div>

              <CoordinatesPicker
                lat={editingShop.lat}
                lng={editingShop.lng}
                radiusMeters={editingShop.allowedRadiusMeters}
                showRadiusControl={true}
                label="Shop Registered GPS Coordinates & Geofence Radius"
                onChange={(lat, lng, radiusMeters) =>
                  setEditingShop({
                    ...editingShop,
                    lat,
                    lng,
                    allowedRadiusMeters: radiusMeters ?? editingShop.allowedRadiusMeters,
                  })
                }
              />

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                <button
                  type="button"
                  onClick={() => setShopModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                >
                  Save Shop Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
