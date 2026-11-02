import React, { useState } from 'react';
import {
  Package,
  Layers,
  Plus,
  Search,
  Edit3,
  Trash2,
  RotateCcw,
  X,
  ArrowRight,
  Archive,
  Download,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ProductGroup,
  Product,
  Distributor,
  ActivePageId,
} from '../../types/infrastructure';
import {
  ProductGroupTag,
  EntityStatusIndicator,
  formatPKR,
} from '../common/StatusBadges';
import {
  ProductExcelImportModal,
  downloadProductExcelTemplate,
  exportCurrentCatalogToExcel,
} from './ProductExcelImportModal';

interface ProductsAndGroupsPagesProps {
  activePage: 'groups' | 'products';
  onNavigate: (page: ActivePageId) => void;
  groups: ProductGroup[];
  setGroups: React.Dispatch<React.SetStateAction<ProductGroup[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  distributors: Distributor[];
  setDistributors: React.Dispatch<React.SetStateAction<Distributor[]>>;
  selectedGroupFilter: string;
  setSelectedGroupFilter: (groupId: string) => void;
  onToast: (message: string) => void;
}

export function ProductsAndGroupsPages({
  activePage,
  onNavigate,
  groups,
  setGroups,
  products,
  setProducts,
  distributors,
  setDistributors,
  selectedGroupFilter,
  setSelectedGroupFilter,
  onToast,
}: ProductsAndGroupsPagesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [productTab, setProductTab] = useState<'active' | 'deleted'>('active');

  // Group Modal state
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProductGroup | null>(null);

  // Product Modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Excel Import Modal state
  const [excelImportModalOpen, setExcelImportModalOpen] = useState(false);

  // Remove Product Confirm Dialog (Design System Section 5 & 7)
  const [removingProduct, setRemovingProduct] = useState<Product | null>(null);
  const [removeReason, setRemoveReason] = useState(
    'Discontinued pack size; historical stock & shop audit records retained.'
  );

  const renderCatalogSubNav = () => null;

  // ============================================================================
  // 1. PRODUCT GROUPS PAGE (Group A / Group B & Custom Groups)
  // ============================================================================
  if (activePage === 'groups') {
    const openNewGroupModal = () => {
      setEditingGroup({
        id: `grp-${Date.now()}`,
        code: `GRP-${String.fromCharCode(65 + groups.length)}`,
        name: `Group ${String.fromCharCode(65 + groups.length)}`,
        divisionTitle: '',
        description: '',
        storageType: 'Ambient Dry',
        defaultStackingMaxCtn: 8,
        badgeStyle: 'groupCustom',
        status: 'Active',
      });
      setGroupModalOpen(true);
    };

    const handleSaveGroup = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingGroup || !editingGroup.code.trim() || !editingGroup.name.trim()) return;
      const exists = groups.some((g) => g.id === editingGroup.id);
      if (exists) {
        setGroups((prev) => prev.map((g) => (g.id === editingGroup.id ? editingGroup : g)));
        onToast(`Updated ${editingGroup.name} (${editingGroup.code}).`);
      } else {
        setGroups((prev) => [...prev, editingGroup]);
        onToast(`Created product group ${editingGroup.name}.`);
      }
      setGroupModalOpen(false);
    };

    const activeProducts = products.filter((p) => p.status === 'Active');
    const groupACount = activeProducts.filter((p) => p.groupId === 'grp-a').length;
    const groupBCount = activeProducts.filter((p) => p.groupId === 'grp-b').length;
    const totalActiveCount = Math.max(1, activeProducts.length);
    const groupAPercent = Math.round((groupACount / totalActiveCount) * 100);
    const groupBPercent = 100 - groupAPercent;

    return (
      <div>
        {renderCatalogSubNav()}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">
              Product Groups Master (Group A & Group B)
            </h1>
            <p className="text-sm text-[#475569]">
              Catalog segmentation governing distributor stock eligibility, warehouse stacking limits, and SKU classification.
            </p>
          </div>
          <button
            onClick={openNewGroupModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product Group</span>
          </button>
        </div>

        {/* Two-Segment Bar: Group A vs Group B Distribution (Design System Section 5) */}
        <div className="bg-white border border-[#CBD5E1] rounded-lg p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-[#0F172A]">
              Active Catalog Split: Group A vs. Group B
            </span>
            <span className="text-xs font-mono text-[#475569] tabular-nums">
              Group A: {groupACount} SKUs ({groupAPercent}%) · Group B: {groupBCount} SKUs ({groupBPercent}%)
            </span>
          </div>
          <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-[#E9EEF5]">
            <div
              style={{ width: `${groupAPercent}%` }}
              className="bg-[#1E3A5F] h-full transition-all"
              title={`Group A: ${groupACount} SKUs`}
            />
            <div
              style={{ width: `${groupBPercent}%` }}
              className="bg-[#0F766E] h-full transition-all"
              title={`Group B: ${groupBCount} SKUs`}
            />
          </div>
        </div>

        {/* Product Group Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {groups.map((grp) => {
            const grpActiveSkus = products.filter(
              (p) => p.groupId === grp.id && p.status === 'Active'
            );
            const grpDeletedSkus = products.filter(
              (p) => p.groupId === grp.id && p.status === 'Deleted'
            );
            const avgCtnValue =
              grpActiveSkus.length > 0
                ? Math.round(
                    grpActiveSkus.reduce(
                      (acc, item) => acc + item.boxesPerCtn * item.pricePerBoxRs,
                      0
                    ) / grpActiveSkus.length
                  )
                : 0;

            return (
              <div
                key={grp.id}
                className="bg-white border border-[#CBD5E1] rounded-lg p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <ProductGroupTag groupName={grp.name} />
                      <span className="font-mono text-xs text-[#475569]">{grp.code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <EntityStatusIndicator status={grp.status} />
                      <button
                        onClick={() => {
                          setEditingGroup(grp);
                          setGroupModalOpen(true);
                        }}
                        aria-label={`Edit ${grp.name}`}
                        className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-[#0F172A]">{grp.divisionTitle}</h2>
                    <p className="text-sm text-[#475569] mt-1 leading-relaxed">{grp.description}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#CBD5E1] text-xs">
                    <div>
                      <span className="text-[#475569] block">Active SKUs</span>
                      <span className="font-mono text-base font-bold text-[#0F172A] tabular-nums">
                        {grpActiveSkus.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#475569] block">Max Stacking</span>
                      <span className="font-mono text-base font-bold text-[#1E3A5F] tabular-nums">
                        {grp.defaultStackingMaxCtn} CTNs
                      </span>
                    </div>
                    <div>
                      <span className="text-[#475569] block">Avg. CTN Value</span>
                      <span className="font-mono text-base font-bold text-[#0F172A] tabular-nums">
                        {formatPKR(avgCtnValue)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#CBD5E1] flex items-center justify-between text-xs">
                  <span className="text-[#475569]">
                    Storage: <strong className="text-[#0F172A]">{grp.storageType}</strong> ·{' '}
                    {grpDeletedSkus.length} archived
                  </span>
                  <button
                    onClick={() => {
                      setSelectedGroupFilter(grp.id);
                      onNavigate('products');
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-[#2563EB] hover:underline cursor-pointer"
                  >
                    <span>Filter Catalog to {grp.name}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add/Edit Group Modal */}
        {groupModalOpen && editingGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-lg w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {groups.some((g) => g.id === editingGroup.id)
                    ? `Edit ${editingGroup.name}`
                    : 'Create Product Group'}
                </h2>
                <button
                  onClick={() => setGroupModalOpen(false)}
                  className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveGroup} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Group Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editingGroup.code}
                      onChange={(e) =>
                        setEditingGroup({ ...editingGroup, code: e.target.value.toUpperCase() })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Group Label
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Group A"
                      value={editingGroup.name}
                      onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Division Title
                    </label>
                    <input
                      type="text"
                      required
                      value={editingGroup.divisionTitle}
                      onChange={(e) =>
                        setEditingGroup({ ...editingGroup, divisionTitle: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Operational Description
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={editingGroup.description}
                      onChange={(e) =>
                        setEditingGroup({ ...editingGroup, description: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Storage Requirement
                    </label>
                    <select
                      value={editingGroup.storageType}
                      onChange={(e) =>
                        setEditingGroup({
                          ...editingGroup,
                          storageType: e.target.value as ProductGroup['storageType'],
                        })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    >
                      <option value="Ambient Dry">Ambient Dry</option>
                      <option value="High-Velocity FMCG">High-Velocity FMCG</option>
                      <option value="Temperature Controlled">Temperature Controlled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Default Max Stacking (CTNs)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      inputMode="numeric"
                      value={editingGroup.defaultStackingMaxCtn}
                      onChange={(e) =>
                        setEditingGroup({
                          ...editingGroup,
                          defaultStackingMaxCtn: parseInt(e.target.value, 10) || 6,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setGroupModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                  >
                    Save Group
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ProductExcelImportModal
          isOpen={excelImportModalOpen}
          onClose={() => setExcelImportModalOpen(false)}
          groups={groups}
          products={products}
          setProducts={setProducts}
          distributors={distributors}
          setDistributors={setDistributors}
          onToast={onToast}
        />
      </div>
    );
  }

  // ============================================================================
  // 2. PRODUCTS CATALOG PAGE (Active Catalog + Deleted/Archived Products with Restore)
  // ============================================================================
  const filteredProducts = products.filter(
    (p) =>
      (productTab === 'active' ? p.status === 'Active' : p.status === 'Deleted') &&
      (selectedGroupFilter === 'ALL' || p.groupId === selectedGroupFilter) &&
      (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const openNewProductModal = () => {
    const defaultGrp =
      groups.find((g) => g.id === selectedGroupFilter) || groups[0] || {
        id: 'grp-a',
        name: 'Group A',
      };
    setEditingProduct({
      id: `prd-${Date.now()}`,
      sku: `PRD-${defaultGrp.name.includes('B') ? 'B' : 'A'}${105 + products.length}`,
      name: '',
      groupId: defaultGrp.id,
      groupName: defaultGrp.name,
      unitPerBox: '24 Packs × 50g',
      unitsCountPerBox: 24,
      boxesPerCtn: 12,
      pricePerBoxRs: 3900,
      stackingStandard: 'Max 8 CTN High',
      shelfLifeDays: 365,
      status: 'Active',
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.sku.trim() || !editingProduct.name.trim()) return;
    const grp = groups.find((g) => g.id === editingProduct.groupId);
    const updated: Product = {
      ...editingProduct,
      groupName: grp?.name || editingProduct.groupName,
    };
    const exists = products.some((p) => p.id === updated.id);
    if (exists) {
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      // Ensure any distributor linked to updated.groupId has an entry for this product (defaulting to Active if not yet present)
      setDistributors((prev) =>
        prev.map((d) => {
          if (!d.groupIds.includes(updated.groupId)) return d;
          if (d.productStatuses[updated.id]) return d;
          return {
            ...d,
            productStatuses: {
              ...d.productStatuses,
              [updated.id]: 'Active',
            },
          };
        })
      );
      onToast(`Updated SKU ${updated.sku} (${updated.name}).`);
    } else {
      setProducts((prev) => [...prev, updated]);
      // Requirement: new product added to product catalog linked group must be added into linked distributor(s) in Active mode
      const linkedDistCount = distributors.filter((d) =>
        d.groupIds.includes(updated.groupId)
      ).length;
      setDistributors((prev) =>
        prev.map((d) =>
          d.groupIds.includes(updated.groupId)
            ? {
                ...d,
                productStatuses: {
                  ...d.productStatuses,
                  [updated.id]: 'Active',
                },
              }
            : d
        )
      );
      onToast(
        `Added SKU ${updated.sku} to ${updated.groupName} and auto-linked in Active mode to ${linkedDistCount} ${updated.groupName} distributor(s).`
      );
    }
    setProductModalOpen(false);
  };

  const handleConfirmRemoveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!removingProduct) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === removingProduct.id
          ? {
              ...p,
              status: 'Deleted',
              deletedAt: new Date().toISOString().slice(0, 10),
              deletedReason: removeReason,
            }
          : p
      )
    );
    onToast(
      `Archived ${removingProduct.sku}. Historical stock & shop audit records remain preserved.`
    );
    setRemovingProduct(null);
  };

  const handleRestoreProduct = (prd: Product) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === prd.id
          ? { ...p, status: 'Active', deletedAt: undefined, deletedReason: undefined }
          : p
      )
    );
    // Also ensure restored product is linked in Active mode for distributors of its group if not already set
    setDistributors((prev) =>
      prev.map((d) =>
        d.groupIds.includes(prd.groupId) && !d.productStatuses[prd.id]
          ? {
              ...d,
              productStatuses: {
                ...d.productStatuses,
                [prd.id]: 'Active',
              },
            }
          : d
      )
    );
    onToast(
      `Restored SKU ${prd.sku} (${prd.name}) to active catalog and linked distributors.`
    );
  };

  return (
    <div>
      {renderCatalogSubNav()}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Product Catalog & Master Carton Pricing
          </h1>
          <p className="text-sm text-[#475569]">
            Master SKU specifications (`Boxes/CTN`, `Unit/Box`, `Price/Box`, `CTN Value`) used across distributor and retail audits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Group Filter Buttons */}
          <div className="flex items-center gap-1 p-1 bg-[#E9EEF5] rounded-lg">
            <button
              onClick={() => setSelectedGroupFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                selectedGroupFilter === 'ALL'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              All Groups
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupFilter(g.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  selectedGroupFilter === g.id
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search SKU (PRD-A101) or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-60"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              downloadProductExcelTemplate(groups);
              onToast('Downloaded AuditGrid_Product_Import_Template.xlsx.');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1E3A5F] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 text-[#2563EB]" />
            <span>Template (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => setExcelImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1E3A5F] bg-white border border-[#1E3A5F] rounded-lg hover:bg-[#E9EEF5] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4 text-[#2563EB]" />
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              exportCurrentCatalogToExcel(products);
              onToast('Exported active product catalog to AuditGrid_Active_Products_Catalog.xlsx.');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#475569] bg-white border border-[#CBD5E1] rounded-lg hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#16A34A]" />
            <span>Export Catalog</span>
          </button>

          <button
            onClick={openNewProductModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Active vs Deleted Products Tabs (Design System Section 5) */}
      <div className="flex items-center gap-4 border-b border-[#CBD5E1] mb-4">
        <button
          onClick={() => setProductTab('active')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            productTab === 'active'
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          Assigned / Active Products ({products.filter((p) => p.status === 'Active').length})
        </button>
        <button
          onClick={() => setProductTab('deleted')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            productTab === 'deleted'
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Deleted Products ({products.filter((p) => p.status === 'Deleted').length})</span>
        </button>
      </div>

      <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                <th className="py-2.5 px-3">SKU Code</th>
                <th className="py-2.5 px-3">Product Name</th>
                <th className="py-2.5 px-3">Group</th>
                <th className="py-2.5 px-3">Unit / Box</th>
                <th className="py-2.5 px-3 text-right">Boxes / CTN</th>
                <th className="py-2.5 px-3 text-right">Price / Box</th>
                <th className="py-2.5 px-3 text-right">Full CTN Value</th>
                <th className="py-2.5 px-3">
                  {productTab === 'active' ? 'Stacking Standard' : 'Archive Note & Date'}
                </th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CBD5E1]">
              {filteredProducts.map((prd) => {
                const ctnValueRs = prd.boxesPerCtn * prd.pricePerBoxRs;
                return (
                  <tr key={prd.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums">
                      {prd.sku}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{prd.name}</td>
                    <td className="py-2.5 px-3">
                      <ProductGroupTag groupName={prd.groupName} />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-[#475569] tabular-nums">
                      {prd.unitPerBox}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#0F172A] tabular-nums">
                      {prd.boxesPerCtn}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#0F172A] tabular-nums">
                      {formatPKR(prd.pricePerBoxRs)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#1E3A5F] tabular-nums">
                      {formatPKR(ctnValueRs)}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[#475569]">
                      {productTab === 'active' ? (
                        <span>
                          {prd.stackingStandard} · {prd.shelfLifeDays}d shelf
                        </span>
                      ) : (
                        <div>
                          <span className="font-mono text-[#0F172A]">{prd.deletedAt}</span> —{' '}
                          {prd.deletedReason}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {productTab === 'active' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingProduct(prd);
                              setProductModalOpen(true);
                            }}
                            aria-label={`Edit ${prd.name}`}
                            className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setRemovingProduct(prd)}
                            aria-label={`Remove ${prd.name}`}
                            className="p-1.5 text-[#DC2626] hover:bg-[#DC2626]/10 rounded cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRestoreProduct(prd)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[#16A34A] bg-[#16A34A]/10 border border-[#16A34A]/30 rounded hover:bg-[#16A34A]/20 cursor-pointer whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {productModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#CBD5E1] rounded-lg max-w-xl w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <h2 className="text-lg font-bold text-[#0F172A]">
                {products.some((p) => p.id === editingProduct.id)
                  ? `Edit Product (${editingProduct.sku})`
                  : 'Add New Master Product'}
              </h2>
              <button
                onClick={() => setProductModalOpen(false)}
                className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Product Group (Group A / B)
                  </label>
                  <select
                    value={editingProduct.groupId}
                    onChange={(e) => {
                      const grp = groups.find((g) => g.id === e.target.value);
                      setEditingProduct({
                        ...editingProduct,
                        groupId: e.target.value,
                        groupName: grp?.name || 'Group A',
                      });
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} — {g.divisionTitle}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.sku}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, sku: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Product Full Name & Pack Weight
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sindhi Biryani Masala — 60g Box"
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Unit / Box Specification
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 24 Packs × 60g"
                    value={editingProduct.unitPerBox}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, unitPerBox: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Boxes per Carton (Boxes/CTN)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    inputMode="numeric"
                    value={editingProduct.boxesPerCtn}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        boxesPerCtn: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Wholesale Price per Box (Rs.)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    inputMode="numeric"
                    value={editingProduct.pricePerBoxRs}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        pricePerBoxRs: Math.max(1, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Stacking Limit Standard
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.stackingStandard}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, stackingStandard: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
              </div>

              {/* Live Read-Only Carton Valuation Preview */}
              <div
                aria-live="polite"
                className="p-3.5 bg-[#E9EEF5] border border-[#CBD5E1] rounded-lg flex items-center justify-between text-xs"
              >
                <span className="font-medium text-[#475569]">
                  Calculated Master Carton Valuation ({editingProduct.boxesPerCtn} Boxes ×{' '}
                  {formatPKR(editingProduct.pricePerBoxRs)}):
                </span>
                <span className="font-mono text-base font-bold text-[#1E3A5F] tabular-nums">
                  {formatPKR(editingProduct.boxesPerCtn * editingProduct.pricePerBoxRs)} / CTN
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Product Confirm Dialog (Design System Section 5 & 7) */}
      {removingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#CBD5E1] rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <h2 className="text-lg font-bold text-[#0F172A]">
                Remove Product ({removingProduct.sku})?
              </h2>
              <button
                onClick={() => setRemovingProduct(null)}
                className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-[#FEF3C7] border border-[#B45309]/30 rounded text-xs text-[#B45309]">
              <strong>What is kept:</strong> Removing <strong>{removingProduct.name}</strong> moves
              it to the <em>Deleted Products</em> tab so it no longer appears in new audit dropdowns,
              while all historical distributor stock audits and retail shop audit entries remain
              100% intact. You can restore it anytime.
            </div>
            <form onSubmit={handleConfirmRemoveProduct} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Archive Reason
                </label>
                <input
                  type="text"
                  required
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
                <button
                  type="button"
                  onClick={() => setRemovingProduct(null)}
                  className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#DC2626] rounded-lg hover:bg-[#DC2626]/90 cursor-pointer"
                >
                  Move to Deleted Products
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ProductExcelImportModal
        isOpen={excelImportModalOpen}
        onClose={() => setExcelImportModalOpen(false)}
        groups={groups}
        products={products}
        setProducts={setProducts}
        distributors={distributors}
        setDistributors={setDistributors}
        onToast={onToast}
      />
    </div>
  );
}
