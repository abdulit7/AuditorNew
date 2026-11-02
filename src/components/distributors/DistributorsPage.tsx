import React, { useState } from 'react';
import {
  Truck,
  Plus,
  Search,
  Edit3,
  Trash2,
  Power,
  CheckCircle2,
  XCircle,
  MapPin,
  Phone,
  User,
  CreditCard,
  Building2,
  Package,
  ArrowLeft,
  CheckSquare,
  Square,
  X,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import {
  Distributor,
  City,
  Territory,
  ProductGroup,
  Product,
  ActivePageId,
} from '../../types/infrastructure';
import {
  EntityStatusIndicator,
  ProductGroupTag,
  CoordinatesPicker,
  formatPKR,
} from '../common/StatusBadges';

interface DistributorsPageProps {
  distributors: Distributor[];
  setDistributors: React.Dispatch<React.SetStateAction<Distributor[]>>;
  cities: City[];
  territories: Territory[];
  setTerritories: React.Dispatch<React.SetStateAction<Territory[]>>;
  groups: ProductGroup[];
  products: Product[];
  selectedDistributorId: string | null;
  setSelectedDistributorId: (id: string | null) => void;
  onNavigate: (page: ActivePageId) => void;
  onToast: (message: string) => void;
}

export function formatCNICInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

export function DistributorsPage({
  distributors,
  setDistributors,
  cities,
  territories,
  setTerritories,
  groups,
  products,
  selectedDistributorId,
  setSelectedDistributorId,
  onNavigate,
  onToast,
}: DistributorsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Inactive'>('ALL');

  // Detail View Tabs (Design System Section 5)
  const [detailTab, setDetailTab] = useState<
    'assigned-active' | 'assigned-inactive' | 'all-group-skus' | 'overview'
  >('all-group-skus');
  const [skuSearch, setSkuSearch] = useState('');
  const [skuGroupFilter, setSkuGroupFilter] = useState('ALL');
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([]);

  // Add/Edit Distributor Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDist, setEditingDist] = useState<Distributor | null>(null);

  // Deactivate / Activate Confirmation Modal
  const [togglingStatusDist, setTogglingStatusDist] = useState<Distributor | null>(null);

  // Delete Distributor Confirmation Modal
  const [deletingDist, setDeletingDist] = useState<Distributor | null>(null);

  const getCity = (id: string) => cities.find((c) => c.id === id);
  const getTerritory = (id: string) => territories.find((t) => t.id === id);
  const getGroup = (id: string) => groups.find((g) => g.id === id);

  const selectedDistributor = distributors.find((d) => d.id === selectedDistributorId) || null;

  // Helper: get all active catalog products belonging to a distributor's linked groups
  const getDistributorCatalogProducts = (dist: Distributor) => {
    return products.filter(
      (p) => p.status === 'Active' && dist.groupIds.includes(p.groupId)
    );
  };

  // Helper: check if a product is Active for a specific distributor (defaults to Active if in linked group)
  const isProductActiveForDistributor = (dist: Distributor, productId: string): boolean => {
    const explicit = dist.productStatuses[productId];
    return explicit ? explicit === 'Active' : true;
  };

  // Open Create Distributor Modal
  const openCreateModal = () => {
    const defaultCity = cities[0];
    const cityTerritories = territories.filter((t) => t.cityId === defaultCity.id);
    const defaultTer = cityTerritories[0] || territories[0];
    const defaultGroupIds = [groups[0]?.id || 'grp-a'];

    // Build initial productStatuses in Active mode for all products in defaultGroupIds
    const initialStatuses: Record<string, 'Active' | 'Inactive'> = {};
    products
      .filter((p) => p.status === 'Active' && defaultGroupIds.includes(p.groupId))
      .forEach((p) => {
        initialStatuses[p.id] = 'Active';
      });

    setEditingDist({
      id: `dist-${Date.now()}`,
      code: `DST-${defaultCity.code}-0${distributors.length + 1}`,
      setupName: '',
      distributorName: '',
      fatherName: '',
      cnic: '',
      phone: '+92 300 ',
      cityId: defaultCity.id,
      territoryId: defaultTer?.id || '',
      completeAddress: '',
      groupIds: defaultGroupIds,
      productStatuses: initialStatuses,
      lat: defaultTer?.lat || defaultCity.lat,
      lng: defaultTer?.lng || defaultCity.lng,
      status: 'Active',
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  };

  // Open Edit Distributor Modal
  const openEditModal = (dist: Distributor) => {
    setEditingDist({
      ...dist,
      groupIds: [...dist.groupIds],
      productStatuses: { ...dist.productStatuses },
    });
    setModalOpen(true);
  };

  // Handle City Change inside Add/Edit Modal -> Automatically filter Territories by selected City!
  const handleModalCityChange = (nextCityId: string) => {
    if (!editingDist) return;
    const cityObj = getCity(nextCityId);
    const matchingTerritories = territories.filter((t) => t.cityId === nextCityId);
    const firstMatchingTer = matchingTerritories[0];

    setEditingDist({
      ...editingDist,
      cityId: nextCityId,
      territoryId: firstMatchingTer ? firstMatchingTer.id : '',
      code: editingDist.code.startsWith('DST-')
        ? `DST-${cityObj?.code || 'PK'}-0${distributors.length + 1}`
        : editingDist.code,
      lat: firstMatchingTer?.lat || cityObj?.lat || editingDist.lat,
      lng: firstMatchingTer?.lng || cityObj?.lng || editingDist.lng,
    });
  };

  // Handle Product Group Toggle inside Add/Edit Modal -> Auto-link group products in Active mode
  const handleModalGroupToggle = (groupId: string) => {
    if (!editingDist) return;
    const isSelected = editingDist.groupIds.includes(groupId);
    const nextGroupIds = isSelected
      ? editingDist.groupIds.filter((id) => id !== groupId)
      : [...editingDist.groupIds, groupId];

    // Ensure at least 1 group remains selected
    if (nextGroupIds.length === 0) return;

    const nextProductStatuses = { ...editingDist.productStatuses };
    if (!isSelected) {
      // Newly linked group: mark all active catalog products of this group as 'Active' by default
      products
        .filter((p) => p.status === 'Active' && p.groupId === groupId)
        .forEach((p) => {
          if (!nextProductStatuses[p.id]) {
            nextProductStatuses[p.id] = 'Active';
          }
        });
    }

    setEditingDist({
      ...editingDist,
      groupIds: nextGroupIds,
      productStatuses: nextProductStatuses,
    });
  };

  // Save Distributor (Create or Update) + Link to Selected Territory + Link Group Products
  const handleSaveDistributor = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !editingDist ||
      !editingDist.setupName.trim() ||
      !editingDist.distributorName.trim() ||
      !editingDist.territoryId
    ) {
      return;
    }

    // Ensure all products of selected groups have an explicit status (default 'Active')
    const syncedProductStatuses: Record<string, 'Active' | 'Inactive'> = {
      ...editingDist.productStatuses,
    };
    products
      .filter((p) => p.status === 'Active' && editingDist.groupIds.includes(p.groupId))
      .forEach((p) => {
        if (!syncedProductStatuses[p.id]) {
          syncedProductStatuses[p.id] = 'Active';
        }
      });

    const finalDist: Distributor = {
      ...editingDist,
      setupName: editingDist.setupName.trim(),
      distributorName: editingDist.distributorName.trim(),
      fatherName: editingDist.fatherName.trim(),
      completeAddress: editingDist.completeAddress.trim(),
      productStatuses: syncedProductStatuses,
    };

    const exists = distributors.some((d) => d.id === finalDist.id);
    if (exists) {
      setDistributors((prev) => prev.map((d) => (d.id === finalDist.id ? finalDist : d)));
    } else {
      setDistributors((prev) => [finalDist, ...prev]);
    }

    // Link this distributor to the selected Territory!
    setTerritories((prev) =>
      prev.map((t) =>
        t.id === finalDist.territoryId
          ? {
              ...t,
              distributorName: finalDist.setupName,
              distributorCode: finalDist.code,
              updatedAt: new Date().toISOString().slice(0, 10),
            }
          : t
      )
    );

    const terObj = getTerritory(finalDist.territoryId);
    const totalLinkedSkus = products.filter(
      (p) => p.status === 'Active' && finalDist.groupIds.includes(p.groupId)
    ).length;

    onToast(
      `${exists ? 'Updated' : 'Created'} distributor "${finalDist.setupName}", linked to territory ${
        terObj?.code || ''
      }, and linked ${totalLinkedSkus} products from selected group(s).`
    );
    setModalOpen(false);
    setSelectedDistributorId(finalDist.id);
  };

  // Toggle Single Product Active / Inactive for Selected Distributor
  const handleToggleProductStatusForDistributor = (
    distId: string,
    productId: string
  ) => {
    setDistributors((prev) =>
      prev.map((d) => {
        if (d.id !== distId) return d;
        const current = isProductActiveForDistributor(d, productId) ? 'Active' : 'Inactive';
        const nextStatus = current === 'Active' ? 'Inactive' : 'Active';
        return {
          ...d,
          productStatuses: {
            ...d.productStatuses,
            [productId]: nextStatus,
          },
        };
      })
    );
    const prd = products.find((p) => p.id === productId);
    const dist = distributors.find((d) => d.id === distId);
    if (prd && dist) {
      const nextStatus = isProductActiveForDistributor(dist, productId)
        ? 'Inactive (Not Dealing)'
        : 'Active (Dealing)';
      onToast(`${prd.sku} set to ${nextStatus} for ${dist.setupName}.`);
    }
  };

  // Bulk Set Active / Inactive for Selected Distributor
  const handleBulkSetProductStatus = (
    distId: string,
    productIds: string[],
    targetStatus: 'Active' | 'Inactive'
  ) => {
    if (productIds.length === 0) return;
    setDistributors((prev) =>
      prev.map((d) => {
        if (d.id !== distId) return d;
        const nextMap = { ...d.productStatuses };
        productIds.forEach((pid) => {
          nextMap[pid] = targetStatus;
        });
        return {
          ...d,
          productStatuses: nextMap,
        };
      })
    );
    onToast(
      `Marked ${productIds.length} product(s) as ${targetStatus} for this distributor.`
    );
    setSelectedSkuIds([]);
  };

  // Confirm Deactivate / Activate Distributor
  const handleConfirmToggleDistributorStatus = () => {
    if (!togglingStatusDist) return;
    const nextStatus = togglingStatusDist.status === 'Active' ? 'Inactive' : 'Active';
    setDistributors((prev) =>
      prev.map((d) => (d.id === togglingStatusDist.id ? { ...d, status: nextStatus } : d))
    );
    onToast(
      `${nextStatus === 'Inactive' ? 'Deactivated' : 'Activated'} distributor "${
        togglingStatusDist.setupName
      }". Territory hierarchy & audit history kept.`
    );
    setTogglingStatusDist(null);
  };

  // Confirm Delete Distributor
  const handleConfirmDeleteDistributor = () => {
    if (!deletingDist) return;
    setDistributors((prev) => prev.filter((d) => d.id !== deletingDist.id));
    if (selectedDistributorId === deletingDist.id) {
      setSelectedDistributorId(null);
    }
    onToast(
      `Deleted distributor "${deletingDist.setupName}". Linked territory tree remains intact.`
    );
    setDeletingDist(null);
  };

  // ============================================================================
  // DISTRIBUTOR DETAIL & PRODUCT PORTFOLIO VIEW (Active vs Inactive SKUs)
  // ============================================================================
  if (selectedDistributor) {
    const distCity = getCity(selectedDistributor.cityId);
    const distTerritory = getTerritory(selectedDistributor.territoryId);
    const catalogProducts = getDistributorCatalogProducts(selectedDistributor);

    const activeDealingProducts = catalogProducts.filter((p) =>
      isProductActiveForDistributor(selectedDistributor, p.id)
    );
    const inactiveExcludedProducts = catalogProducts.filter(
      (p) => !isProductActiveForDistributor(selectedDistributor, p.id)
    );

    const displayedProducts = catalogProducts.filter((p) => {
      const isSkuActive = isProductActiveForDistributor(selectedDistributor, p.id);
      if (detailTab === 'assigned-active' && !isSkuActive) return false;
      if (detailTab === 'assigned-inactive' && isSkuActive) return false;
      if (skuGroupFilter !== 'ALL' && p.groupId !== skuGroupFilter) return false;
      if (
        skuSearch &&
        !p.name.toLowerCase().includes(skuSearch.toLowerCase()) &&
        !p.sku.toLowerCase().includes(skuSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    const toggleSelectSku = (id: string) => {
      setSelectedSkuIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    };

    const toggleSelectAllDisplayed = () => {
      if (selectedSkuIds.length === displayedProducts.length && displayedProducts.length > 0) {
        setSelectedSkuIds([]);
      } else {
        setSelectedSkuIds(displayedProducts.map((p) => p.id));
      }
    };

    return (
      <div className="space-y-6">
        {/* Top Back & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-[#CBD5E1] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedDistributorId(null);
                setSelectedSkuIds([]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] bg-[#F8FAFC] border border-[#CBD5E1] rounded-md hover:bg-[#E9EEF5] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Distributors</span>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                  {selectedDistributor.code}
                </span>
                <h1 className="text-xl font-bold text-[#0F172A]">
                  {selectedDistributor.setupName}
                </h1>
                <EntityStatusIndicator status={selectedDistributor.status} />
              </div>
              <p className="text-xs text-[#475569] mt-0.5">
                Proprietor: <strong className="text-[#0F172A]">{selectedDistributor.distributorName}</strong>{' '}
                (S/O {selectedDistributor.fatherName}) · CNIC:{' '}
                <span className="font-mono text-[#0F172A]">{selectedDistributor.cnic}</span> · Territory:{' '}
                <span className="font-mono font-semibold text-[#1E3A5F]">
                  {distTerritory?.code}
                </span>{' '}
                ({distCity?.name})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openEditModal(selectedDistributor)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1E3A5F] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Edit Setup & Groups</span>
            </button>
            <button
              onClick={() => setTogglingStatusDist(selectedDistributor)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                selectedDistributor.status === 'Active'
                  ? 'text-[#B45309] bg-[#FEF3C7]/60 border-[#B45309]/30 hover:bg-[#FEF3C7]'
                  : 'text-[#16A34A] bg-[#16A34A]/10 border-[#16A34A]/30 hover:bg-[#16A34A]/20'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>
                {selectedDistributor.status === 'Active' ? 'Deactivate' : 'Activate'}
              </span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip for Distributor Setup & Product Dealing Ratio */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-[#CBD5E1] rounded-lg p-4">
            <span className="text-xs text-[#475569] block">Linked Territory & City</span>
            <div className="font-mono text-lg font-bold text-[#1E3A5F] mt-1">
              {distTerritory?.code || 'Unassigned'} · {distCity?.code}
            </div>
            <div className="text-xs text-[#475569] truncate">
              {distTerritory?.name} ({distCity?.name})
            </div>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-lg p-4">
            <span className="text-xs text-[#475569] block">Linked Product Groups</span>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {selectedDistributor.groupIds.map((gid) => {
                const grp = getGroup(gid);
                return grp ? <ProductGroupTag key={gid} groupName={grp.name} /> : null;
              })}
            </div>
            <div className="text-xs text-[#475569] mt-1.5">
              Auto-receives new catalog SKUs in Active mode
            </div>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-lg p-4">
            <span className="text-xs text-[#475569] block">
              Active Dealing Products
            </span>
            <div className="font-mono text-2xl font-bold text-[#16A34A] tabular-nums mt-0.5">
              {activeDealingProducts.length}{' '}
              <span className="text-xs font-normal text-[#475569]">
                / {catalogProducts.length} Group SKUs
              </span>
            </div>
            <div className="text-xs text-[#475569]">
              Eligible for Distributor Stock Audit
            </div>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-lg p-4">
            <span className="text-xs text-[#475569] block">
              Inactive Products (Not Dealing)
            </span>
            <div className="font-mono text-2xl font-bold text-[#475569] tabular-nums mt-0.5">
              {inactiveExcludedProducts.length}{' '}
              <span className="text-xs font-normal text-[#475569]">SKUs</span>
            </div>
            <div className="text-xs text-[#475569]">
              Hidden from this distributor&apos;s audit form
            </div>
          </div>
        </div>

        {/* Detail Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CBD5E1]">
          <div className="flex flex-wrap items-center gap-5">
            <button
              onClick={() => setDetailTab('all-group-skus')}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                detailTab === 'all-group-skus'
                  ? 'border-[#1E3A5F] text-[#1E3A5F]'
                  : 'border-transparent text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              All Linked Group Products ({catalogProducts.length})
            </button>
            <button
              onClick={() => setDetailTab('assigned-active')}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                detailTab === 'assigned-active'
                  ? 'border-[#16A34A] text-[#16A34A]'
                  : 'border-transparent text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Active / Dealing Products ({activeDealingProducts.length})
            </button>
            <button
              onClick={() => setDetailTab('assigned-inactive')}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                detailTab === 'assigned-inactive'
                  ? 'border-[#1E3A5F] text-[#1E3A5F]'
                  : 'border-transparent text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Inactive / Excluded Products ({inactiveExcludedProducts.length})
            </button>
            <button
              onClick={() => setDetailTab('overview')}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                detailTab === 'overview'
                  ? 'border-[#1E3A5F] text-[#1E3A5F]'
                  : 'border-transparent text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Setup Details & Warehouse Map
            </button>
          </div>
        </div>

        {detailTab === 'overview' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-[#CBD5E1] rounded-lg p-5 space-y-4">
              <h2 className="text-base font-bold text-[#0F172A] border-b border-[#CBD5E1] pb-2.5">
                Distributor Legal & Identity Profile
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-[#475569] block">Distributor Setup Name</span>
                  <span className="font-bold text-[#0F172A]">{selectedDistributor.setupName}</span>
                </div>
                <div>
                  <span className="text-xs text-[#475569] block">Master Code</span>
                  <span className="font-mono font-bold text-[#1E3A5F]">
                    {selectedDistributor.code}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#475569] block">Distributor&apos;s Name</span>
                  <span className="font-semibold text-[#0F172A]">
                    {selectedDistributor.distributorName}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#475569] block">Father Name</span>
                  <span className="font-semibold text-[#0F172A]">
                    {selectedDistributor.fatherName}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#475569] block">Distributor&apos;s CNIC Number</span>
                  <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                    {selectedDistributor.cnic}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#475569] block">Contact Number</span>
                  <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                    {selectedDistributor.phone}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#475569] block">City</span>
                  <span className="font-semibold text-[#0F172A]">
                    {distCity?.code} — {distCity?.name}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#475569] block">Linked Territory</span>
                  <span className="font-mono font-semibold text-[#1E3A5F]">
                    {distTerritory?.code} — {distTerritory?.name}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-[#475569] block">Complete Warehouse Address</span>
                  <span className="font-medium text-[#0F172A]">
                    {selectedDistributor.completeAddress}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-[#CBD5E1] rounded-lg p-5">
              <CoordinatesPicker
                lat={selectedDistributor.lat}
                lng={selectedDistributor.lng}
                label="Distributor Warehouse Master Coordinates"
                onChange={(lat, lng) => {
                  setDistributors((prev) =>
                    prev.map((d) =>
                      d.id === selectedDistributor.id ? { ...d, lat, lng } : d
                    )
                  );
                }}
              />
            </div>
          </div>
        ) : (
          /* Product Portfolio Manager: Activate / Deactivate individual or bulk products for this Distributor */
          <div className="space-y-4">
            <div className="bg-white border border-[#CBD5E1] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter SKU or product name..."
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg focus-ring w-60"
                  />
                </div>

                {selectedDistributor.groupIds.length > 1 && (
                  <select
                    aria-label="Filter by Linked Product Group"
                    value={skuGroupFilter}
                    onChange={(e) => setSkuGroupFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
                  >
                    <option value="ALL">All Linked Groups</option>
                    {selectedDistributor.groupIds.map((gid) => {
                      const grp = getGroup(gid);
                      return grp ? (
                        <option key={gid} value={gid}>
                          {grp.name} ({grp.divisionTitle})
                        </option>
                      ) : null;
                    })}
                  </select>
                )}
              </div>

              {/* Bulk Active / Inactive Action Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedSkuIds.length > 0 ? (
                  <>
                    <span className="text-xs font-mono text-[#1E3A5F] font-semibold">
                      {selectedSkuIds.length} selected:
                    </span>
                    <button
                      onClick={() =>
                        handleBulkSetProductStatus(
                          selectedDistributor.id,
                          selectedSkuIds,
                          'Active'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#16A34A] rounded hover:bg-[#16A34A]/90 cursor-pointer"
                    >
                      Set Selected Active
                    </button>
                    <button
                      onClick={() =>
                        handleBulkSetProductStatus(
                          selectedDistributor.id,
                          selectedSkuIds,
                          'Inactive'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold text-[#0F172A] bg-[#E9EEF5] border border-[#CBD5E1] rounded hover:bg-[#CBD5E1] cursor-pointer"
                    >
                      Set Selected Inactive
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        handleBulkSetProductStatus(
                          selectedDistributor.id,
                          catalogProducts.map((p) => p.id),
                          'Active'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-medium text-[#1E3A5F] bg-[#F8FAFC] border border-[#CBD5E1] rounded hover:bg-[#E9EEF5] cursor-pointer"
                    >
                      Activate All ({catalogProducts.length})
                    </button>
                    <button
                      onClick={() => onNavigate('products')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                    >
                      <span>+ Add New SKU to Catalog</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                      <th className="py-2.5 px-3 w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all displayed products"
                          checked={
                            displayedProducts.length > 0 &&
                            selectedSkuIds.length === displayedProducts.length
                          }
                          onChange={toggleSelectAllDisplayed}
                          className="rounded border-[#CBD5E1]"
                        />
                      </th>
                      <th className="py-2.5 px-3">SKU Code</th>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3">Group</th>
                      <th className="py-2.5 px-3">Unit / Box</th>
                      <th className="py-2.5 px-3 text-right">Boxes / CTN</th>
                      <th className="py-2.5 px-3 text-right">Price / Box</th>
                      <th className="py-2.5 px-3 text-right">Full CTN Value</th>
                      <th className="py-2.5 px-3">Distributor Dealing Status</th>
                      <th className="py-2.5 px-3 text-right">Toggle Active / Inactive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#CBD5E1]">
                    {displayedProducts.map((prd) => {
                      const isDealing = isProductActiveForDistributor(
                        selectedDistributor,
                        prd.id
                      );
                      const isChecked = selectedSkuIds.includes(prd.id);

                      return (
                        <tr
                          key={prd.id}
                          className={`transition-colors ${
                            isDealing ? 'hover:bg-[#F8FAFC]' : 'bg-[#F8FAFC]/60 text-[#475569]'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              aria-label={`Select ${prd.sku}`}
                              checked={isChecked}
                              onChange={() => toggleSelectSku(prd.id)}
                              className="rounded border-[#CBD5E1]"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums">
                            {prd.sku}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#0F172A]">
                            {prd.name}
                          </td>
                          <td className="py-2.5 px-3">
                            <ProductGroupTag groupName={prd.groupName} />
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-[#475569] tabular-nums">
                            {prd.unitPerBox}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {prd.boxesPerCtn}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatPKR(prd.pricePerBoxRs)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#1E3A5F] tabular-nums">
                            {formatPKR(prd.boxesPerCtn * prd.pricePerBoxRs)}
                          </td>
                          <td className="py-2.5 px-3">
                            {isDealing ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Active (Dealing)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Inactive (Excluded)</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleProductStatusForDistributor(
                                  selectedDistributor.id,
                                  prd.id
                                )
                              }
                              className={`px-3 py-1 text-xs font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap ${
                                isDealing
                                  ? 'text-[#475569] bg-white border-[#CBD5E1] hover:text-[#DC2626] hover:border-[#DC2626]'
                                  : 'text-[#16A34A] bg-[#16A34A]/10 border-[#16A34A]/30 hover:bg-[#16A34A]/20'
                              }`}
                            >
                              {isDealing ? 'Set Inactive' : 'Set Active'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // DISTRIBUTORS MASTER DIRECTORY LIST VIEW
  // ============================================================================
  const filteredDistributors = distributors.filter((d) => {
    if (cityFilter && d.cityId !== cityFilter) return false;
    if (groupFilter && !d.groupIds.includes(groupFilter)) return false;
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSetup = d.setupName.toLowerCase().includes(q);
      const matchName = d.distributorName.toLowerCase().includes(q);
      const matchCode = d.code.toLowerCase().includes(q);
      const matchCnic = d.cnic.toLowerCase().includes(q);
      if (!matchSetup && !matchName && !matchCode && !matchCnic) return false;
    }
    return true;
  });

  // Territories available in the Add/Edit Modal based on editingDist.cityId
  const modalCityTerritories = editingDist
    ? territories.filter((t) => t.cityId === editingDist.cityId)
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Distributors Master Setup & Group SKU Portfolio
          </h1>
          <p className="text-sm text-[#475569]">
            Register distributor setups, link territories by city, assign Group A / Group B catalogs, and control active/inactive dealing products per distributor.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Distributor Setup</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#CBD5E1] rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search setup, proprietor, CNIC, code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-72"
            />
          </div>

          <select
            aria-label="Filter by City"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Product Group"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
          >
            <option value="">All Product Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#E9EEF5] rounded-lg">
          {(['ALL', 'Active', 'Inactive'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {st === 'ALL' ? 'All Status' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Distributors Table */}
      <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Distributor Setup & Address</th>
                <th className="py-2.5 px-3">Proprietor & Father Name</th>
                <th className="py-2.5 px-3">CNIC & Contact</th>
                <th className="py-2.5 px-3">City & Linked Territory</th>
                <th className="py-2.5 px-3">Linked Group & Dealing SKUs</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CBD5E1]">
              {filteredDistributors.map((dist) => {
                const city = getCity(dist.cityId);
                const ter = getTerritory(dist.territoryId);
                const catalogSkus = getDistributorCatalogProducts(dist);
                const activeSkuCount = catalogSkus.filter((p) =>
                  isProductActiveForDistributor(dist, p.id)
                ).length;
                const inactiveSkuCount = catalogSkus.length - activeSkuCount;

                return (
                  <tr
                    key={dist.id}
                    onClick={() => setSelectedDistributorId(dist.id)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums whitespace-nowrap">
                      {dist.code}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#0F172A]">{dist.setupName}</div>
                      <div className="text-xs text-[#475569] max-w-xs truncate">
                        {dist.completeAddress}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#0F172A]">{dist.distributorName}</div>
                      <div className="text-xs text-[#475569]">S/O {dist.fatherName}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-xs tabular-nums">
                      <div className="font-semibold text-[#0F172A]">{dist.cnic}</div>
                      <div className="text-[#475569]">{dist.phone}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono text-xs font-bold text-[#1E3A5F]">
                        {ter?.code || 'Unlinked'} · {city?.name}
                      </div>
                      <div className="text-xs text-[#475569] truncate max-w-[180px]">
                        {ter?.name}
                      </div>
                    </td>
                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-1 mb-1">
                        {dist.groupIds.map((gid) => {
                          const grp = getGroup(gid);
                          return grp ? (
                            <ProductGroupTag key={gid} groupName={grp.name} />
                          ) : null;
                        })}
                      </div>
                      <button
                        onClick={() => setSelectedDistributorId(dist.id)}
                        className="text-xs font-mono text-[#2563EB] hover:underline cursor-pointer"
                      >
                        <strong>{activeSkuCount}</strong> Active · {inactiveSkuCount} Inactive →
                      </button>
                    </td>
                    <td className="py-3 px-3">
                      <EntityStatusIndicator status={dist.status} />
                    </td>
                    <td
                      className="py-3 px-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedDistributorId(dist.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] bg-[#F8FAFC] border border-[#CBD5E1] rounded hover:bg-[#E9EEF5] cursor-pointer whitespace-nowrap"
                        >
                          Products ({activeSkuCount}/{catalogSkus.length})
                        </button>
                        <button
                          onClick={() => openEditModal(dist)}
                          aria-label={`Edit ${dist.setupName}`}
                          className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setTogglingStatusDist(dist)}
                          aria-label={
                            dist.status === 'Active'
                              ? `Deactivate ${dist.setupName}`
                              : `Activate ${dist.setupName}`
                          }
                          title={
                            dist.status === 'Active'
                              ? 'Deactivate Distributor'
                              : 'Activate Distributor'
                          }
                          className="p-1.5 text-[#475569] hover:text-[#B45309] hover:bg-[#FEF3C7] rounded cursor-pointer"
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingDist(dist)}
                          aria-label={`Delete ${dist.setupName}`}
                          title="Delete Distributor"
                          className="p-1.5 text-[#475569] hover:text-[#DC2626] hover:bg-[#DC2626]/10 rounded cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* ======================================================================
          ADD / EDIT DISTRIBUTOR SETUP MODAL
          ====================================================================== */}
      {modalOpen && editingDist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#CBD5E1] rounded-lg max-w-3xl w-full p-6 space-y-5 my-8"
          >
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {distributors.some((d) => d.id === editingDist.id)
                    ? `Edit Distributor Setup (${editingDist.code})`
                    : 'Create New Distributor Setup'}
                </h2>
                <p className="text-xs text-[#475569]">
                  Territories are filtered based on the selected City. Linked Product Group SKUs are automatically assigned in Active mode.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDistributor} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Distributor Setup Name (Agency / Business Title)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Al-Falah Trading Corp."
                    value={editingDist.setupName}
                    onChange={(e) =>
                      setEditingDist({ ...editingDist, setupName: e.target.value })
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
                    value={editingDist.code}
                    onChange={(e) =>
                      setEditingDist({ ...editingDist, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Distributor&apos;s Name (Proprietor)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mian Muhammad Akram"
                    value={editingDist.distributorName}
                    onChange={(e) =>
                      setEditingDist({ ...editingDist, distributorName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Father Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Haji Abdul Majeed"
                    value={editingDist.fatherName}
                    onChange={(e) =>
                      setEditingDist({ ...editingDist, fatherName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Distributor&apos;s CNIC Number
                  </label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    placeholder="34101-8291045-3"
                    value={editingDist.cnic}
                    onChange={(e) =>
                      setEditingDist({
                        ...editingDist,
                        cnic: formatCNICInput(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+92 300 6419022"
                    value={editingDist.phone}
                    onChange={(e) => setEditingDist({ ...editingDist, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>

                {/* Select City -> Filters Select Territory */}
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Select City
                  </label>
                  <select
                    value={editingDist.cityId}
                    onChange={(e) => handleModalCityChange(e.target.value)}
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
                    Select Territory (Filtered by {getCity(editingDist.cityId)?.name})
                  </label>
                  <select
                    required
                    value={editingDist.territoryId}
                    onChange={(e) =>
                      setEditingDist({ ...editingDist, territoryId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  >
                    {modalCityTerritories.length === 0 ? (
                      <option value="">No territories in selected city</option>
                    ) : (
                      modalCityTerritories.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} — {t.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Complete Address (Warehouse / Godown Location)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Plot / Godown #, Industrial Estate or Market Road, City"
                    value={editingDist.completeAddress}
                    onChange={(e) =>
                      setEditingDist({ ...editingDist, completeAddress: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
              </div>

              {/* Select Product Group(s) */}
              <div className="border border-[#CBD5E1] rounded-lg p-4 bg-[#F8FAFC] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#0F172A]">
                    Select Product Group(s) to Link to Distributor
                  </label>
                  <span className="text-xs text-[#475569]">
                    All active products in selected group(s) will be linked; you can set specific SKUs Inactive afterwards
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {groups.map((grp) => {
                    const isChecked = editingDist.groupIds.includes(grp.id);
                    const grpSkuCount = products.filter(
                      (p) => p.status === 'Active' && p.groupId === grp.id
                    ).length;

                    return (
                      <label
                        key={grp.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-white border-[#1E3A5F] text-[#0F172A]'
                            : 'bg-white/60 border-[#CBD5E1] text-[#475569]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleModalGroupToggle(grp.id)}
                          className="mt-0.5 rounded border-[#CBD5E1]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#0F172A]">{grp.name}</span>
                            <span className="font-mono text-[11px] bg-[#E9EEF5] text-[#1E3A5F] px-1.5 py-0.5 rounded">
                              {grpSkuCount} SKUs
                            </span>
                          </div>
                          <div className="text-[#475569] mt-0.5">{grp.divisionTitle}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#CBD5E1]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                >
                  Save Distributor & Link Territory + Products
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Deactivate / Activate Distributor Dialog */}
      {togglingStatusDist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#CBD5E1] rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-[#0F172A]">
              {togglingStatusDist.status === 'Active'
                ? `Deactivate ${togglingStatusDist.setupName}?`
                : `Activate ${togglingStatusDist.setupName}?`}
            </h2>
            <div className="p-3 bg-[#FEF3C7] border border-[#B45309]/30 rounded text-xs text-[#B45309]">
              <strong>What is kept:</strong> Changing distributor status preserves the linked
              territory geography tree (<span className="font-mono">{getTerritory(togglingStatusDist.territoryId)?.code}</span>),
              configured active/inactive SKU preferences, and all historical stock audit reports.
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
              <button
                onClick={() => setTogglingStatusDist(null)}
                className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmToggleDistributorStatus}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer ${
                  togglingStatusDist.status === 'Active' ? 'bg-[#B45309]' : 'bg-[#16A34A]'
                }`}
              >
                {togglingStatusDist.status === 'Active'
                  ? 'Confirm Deactivation'
                  : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Distributor Dialog */}
      {deletingDist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#CBD5E1] rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-[#0F172A]">
              Delete Distributor ({deletingDist.setupName})?
            </h2>
            <div className="p-3 bg-[#FEF3C7] border border-[#B45309]/30 rounded text-xs text-[#B45309]">
              <strong>What is kept:</strong> Deleting{' '}
              <span className="font-mono">{deletingDist.code}</span> removes this distributor setup,
              while keeping the territory (<span className="font-mono">{getTerritory(deletingDist.territoryId)?.code}</span>),
              its locations, sub-locations, and retailer shops intact.
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
              <button
                onClick={() => setDeletingDist(null)}
                className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteDistributor}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#DC2626] rounded-lg hover:bg-[#DC2626]/90 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
