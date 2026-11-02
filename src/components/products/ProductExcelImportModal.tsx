import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Check,
  RefreshCw,
} from 'lucide-react';
import {
  Product,
  ProductGroup,
  Distributor,
} from '../../types/infrastructure';
import { ProductGroupTag, formatPKR } from '../common/StatusBadges';

export function downloadProductExcelTemplate(groups: ProductGroup[]) {
  const sampleRows = [
    {
      'SKU Code': 'PRD-A107',
      'Product Name': 'Shahi Haleem Recipe Mix — 300g Family Box',
      'Product Group': groups[0]?.name || 'Group A',
      'Unit Per Box': '12 Boxes × 300g',
      'Units Count Per Box': 12,
      'Boxes Per CTN': 10,
      'Price Per Box (Rs)': 4100,
      'Stacking Standard': 'Max 8 CTN High',
      'Shelf Life (Days)': 365,
    },
    {
      'SKU Code': 'PRD-A108',
      'Product Name': 'Lahori Chargha Masala — 50g Standard Pack',
      'Product Group': groups[0]?.name || 'Group A',
      'Unit Per Box': '24 Packs × 50g',
      'Units Count Per Box': 24,
      'Boxes Per CTN': 12,
      'Price Per Box (Rs)': 3650,
      'Stacking Standard': 'Max 8 CTN High',
      'Shelf Life (Days)': 365,
    },
    {
      'SKU Code': 'PRD-B204',
      'Product Name': 'Strawberry Jelly Crystals — 80g Twin Pack',
      'Product Group': groups[1]?.name || 'Group B',
      'Unit Per Box': '24 Packs × 80g',
      'Units Count Per Box': 24,
      'Boxes Per CTN': 8,
      'Price Per Box (Rs)': 2640,
      'Stacking Standard': 'Max 6 CTN High',
      'Shelf Life (Days)': 450,
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet['!cols'] = [
    { wch: 14 }, // SKU Code
    { wch: 42 }, // Product Name
    { wch: 16 }, // Product Group
    { wch: 20 }, // Unit Per Box
    { wch: 20 }, // Units Count Per Box
    { wch: 15 }, // Boxes Per CTN
    { wch: 20 }, // Price Per Box (Rs)
    { wch: 24 }, // Stacking Standard
    { wch: 18 }, // Shelf Life (Days)
  ];

  const groupReferenceRows = groups.map((g) => ({
    'Group Code': g.code,
    'Group Name (Use in Template)': g.name,
    'Division Title': g.divisionTitle,
    'Storage Type': g.storageType,
    'Default Max Stacking (CTN)': g.defaultStackingMaxCtn,
  }));
  const groupSheet = XLSX.utils.json_to_sheet(groupReferenceRows);
  groupSheet['!cols'] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 38 },
    { wch: 24 },
    { wch: 24 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products_Import_Template');
  XLSX.utils.book_append_sheet(workbook, groupSheet, 'Valid_Groups_Reference');

  XLSX.writeFile(workbook, 'AuditGrid_Product_Import_Template.xlsx');
}

export function exportCurrentCatalogToExcel(products: Product[]) {
  const activeProducts = products.filter((p) => p.status === 'Active');
  const rows = activeProducts.map((p) => ({
    'SKU Code': p.sku,
    'Product Name': p.name,
    'Product Group': p.groupName,
    'Unit Per Box': p.unitPerBox,
    'Units Count Per Box': p.unitsCountPerBox,
    'Boxes Per CTN': p.boxesPerCtn,
    'Price Per Box (Rs)': p.pricePerBoxRs,
    'Full CTN Value (Rs)': p.boxesPerCtn * p.pricePerBoxRs,
    'Stacking Standard': p.stackingStandard,
    'Shelf Life (Days)': p.shelfLifeDays,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 42 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Active_Product_Catalog');
  XLSX.writeFile(workbook, 'AuditGrid_Active_Products_Catalog.xlsx');
}

interface ParsedImportRow {
  rowIndex: number;
  sku: string;
  name: string;
  groupId: string;
  groupName: string;
  unitPerBox: string;
  unitsCountPerBox: number;
  boxesPerCtn: number;
  pricePerBoxRs: number;
  stackingStandard: string;
  shelfLifeDays: number;
  isDuplicateInCatalog: boolean;
  existingProductId?: string;
  errors: string[];
}

interface ProductExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: ProductGroup[];
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  distributors: Distributor[];
  setDistributors: React.Dispatch<React.SetStateAction<Distributor[]>>;
  onToast: (message: string) => void;
}

export function ProductExcelImportModal({
  isOpen,
  onClose,
  groups,
  products,
  setProducts,
  distributors,
  setDistributors,
  onToast,
}: ProductExcelImportModalProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [updateExistingSkus, setUpdateExistingSkus] = useState<boolean>(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const resolveGroup = (rawGroup: string): ProductGroup => {
    const clean = (rawGroup || '').trim().toLowerCase();
    const matched = groups.find(
      (g) =>
        g.name.toLowerCase() === clean ||
        g.code.toLowerCase() === clean ||
        (clean === 'a' && g.name.toLowerCase().includes('group a')) ||
        (clean === 'b' && g.name.toLowerCase().includes('group b'))
    );
    return matched || groups[0];
  };

  const handleFileUpload = (file: File) => {
    setParseError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setParseError('The uploaded Excel file contains no sheets.');
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
        });

        if (rawJson.length === 0) {
          setParseError(
            'No product rows found in the first worksheet. Download the template to check column headers.'
          );
          setParsedRows([]);
          return;
        }

        const results: ParsedImportRow[] = rawJson.map((row, idx) => {
          // Flexible header lookup (case-insensitive)
          const getField = (candidates: string[]): string => {
            const keys = Object.keys(row);
            for (const cand of candidates) {
              const foundKey = keys.find(
                (k) => k.trim().toLowerCase() === cand.toLowerCase()
              );
              if (foundKey !== undefined && row[foundKey] !== undefined) {
                return String(row[foundKey]).trim();
              }
            }
            return '';
          };

          const rawSku = getField(['SKU Code', 'SKU', 'Product Code', 'Code']).toUpperCase();
          const rawName = getField(['Product Name', 'Name', 'Title', 'Description']);
          const rawGroup = getField(['Product Group', 'Group', 'Group Code', 'Division']);
          const rawUnitPerBox =
            getField(['Unit Per Box', 'Unit/Box', 'Pack Size']) || '24 Packs × 50g';
          const rawUnitsCount =
            parseInt(getField(['Units Count Per Box', 'Units/Box', 'Units']), 10) || 24;
          const rawBoxesPerCtn =
            parseInt(getField(['Boxes Per CTN', 'Boxes/CTN', 'Carton Boxes']), 10) || 0;
          const rawPricePerBox =
            parseFloat(
              getField(['Price Per Box (Rs)', 'Price Per Box', 'Price/Box', 'Wholesale Price']).replace(
                /,/g,
                ''
              )
            ) || 0;
          const rawStacking =
            getField(['Stacking Standard', 'Stacking Limit', 'Stacking']) || 'Max 8 CTN High';
          const rawShelfLife =
            parseInt(getField(['Shelf Life (Days)', 'Shelf Life', 'Expiry Days']), 10) || 365;

          const matchedGroup = resolveGroup(rawGroup);
          const existingPrd = products.find(
            (p) => p.sku.toLowerCase() === rawSku.toLowerCase()
          );

          const errors: string[] = [];
          if (!rawSku) errors.push('Missing SKU Code');
          if (!rawName) errors.push('Missing Product Name');
          if (rawBoxesPerCtn <= 0) errors.push('Boxes/CTN must be > 0');
          if (rawPricePerBox <= 0) errors.push('Price/Box must be > 0');

          return {
            rowIndex: idx + 2,
            sku: rawSku || `ROW-${idx + 2}`,
            name: rawName,
            groupId: matchedGroup.id,
            groupName: matchedGroup.name,
            unitPerBox: rawUnitPerBox,
            unitsCountPerBox: rawUnitsCount,
            boxesPerCtn: rawBoxesPerCtn,
            pricePerBoxRs: Math.round(rawPricePerBox),
            stackingStandard: rawStacking,
            shelfLifeDays: rawShelfLife,
            isDuplicateInCatalog: !!existingPrd,
            existingProductId: existingPrd?.id,
            errors,
          };
        });

        setParsedRows(results);
      } catch (err) {
        setParseError(
          'Unable to parse Excel file. Please ensure it is a valid .xlsx, .xls, or .csv file.'
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validRows = parsedRows.filter(
    (r) => r.errors.length === 0 && (updateExistingSkus || !r.isDuplicateInCatalog)
  );

  const handleConfirmImport = () => {
    if (validRows.length === 0) return;

    const newProductsToInsert: Product[] = [];
    const updatedProductsMap = new Map<string, Product>();

    validRows.forEach((row, index) => {
      if (row.isDuplicateInCatalog && row.existingProductId) {
        updatedProductsMap.set(row.existingProductId, {
          id: row.existingProductId,
          sku: row.sku,
          name: row.name,
          groupId: row.groupId,
          groupName: row.groupName,
          unitPerBox: row.unitPerBox,
          unitsCountPerBox: row.unitsCountPerBox,
          boxesPerCtn: row.boxesPerCtn,
          pricePerBoxRs: row.pricePerBoxRs,
          stackingStandard: row.stackingStandard,
          shelfLifeDays: row.shelfLifeDays,
          status: 'Active',
        });
      } else {
        newProductsToInsert.push({
          id: `prd-imp-${Date.now()}-${index}`,
          sku: row.sku,
          name: row.name,
          groupId: row.groupId,
          groupName: row.groupName,
          unitPerBox: row.unitPerBox,
          unitsCountPerBox: row.unitsCountPerBox,
          boxesPerCtn: row.boxesPerCtn,
          pricePerBoxRs: row.pricePerBoxRs,
          stackingStandard: row.stackingStandard,
          shelfLifeDays: row.shelfLifeDays,
          status: 'Active',
        });
      }
    });

    // 1. Update Products state
    setProducts((prev) => {
      const updatedExisting = prev.map((p) => updatedProductsMap.get(p.id) || p);
      return [...newProductsToInsert, ...updatedExisting];
    });

    // 2. Automatically link all newly imported products in 'Active' mode to every distributor linked to their Group!
    setDistributors((prev) =>
      prev.map((dist) => {
        const nextStatuses = { ...dist.productStatuses };
        let changed = false;

        newProductsToInsert.forEach((newPrd) => {
          if (dist.groupIds.includes(newPrd.groupId)) {
            nextStatuses[newPrd.id] = 'Active';
            changed = true;
          }
        });

        updatedProductsMap.forEach((updPrd) => {
          if (dist.groupIds.includes(updPrd.groupId) && !nextStatuses[updPrd.id]) {
            nextStatuses[updPrd.id] = 'Active';
            changed = true;
          }
        });

        return changed ? { ...dist, productStatuses: nextStatuses } : dist;
      })
    );

    onToast(
      `Imported ${newProductsToInsert.length} new SKU(s) and updated ${updatedProductsMap.size} existing SKU(s). All new SKUs automatically linked in Active mode to their Group distributors.`
    );
    setParsedRows([]);
    setFileName(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-import-title"
        className="bg-white border border-[#CBD5E1] rounded-lg max-w-4xl w-full p-6 space-y-5 my-8"
      >
        <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
          <div>
            <h2 id="excel-import-title" className="text-lg font-bold text-[#0F172A]">
              Import Products from Excel (.xlsx / .xls / .csv)
            </h2>
            <p className="text-xs text-[#475569]">
              Download the standard Excel template, populate your Group A / Group B products, and upload to bulk-import and auto-link to distributors.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close import modal"
            className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Download Template Banner */}
        <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-[#0F172A]">
              Step 1: Need the official Excel column structure?
            </div>
            <p className="text-xs text-[#475569]">
              Includes pre-configured headers (<code className="font-mono">SKU Code</code>,{' '}
              <code className="font-mono">Product Name</code>,{' '}
              <code className="font-mono">Product Group</code>,{' '}
              <code className="font-mono">Unit Per Box</code>,{' '}
              <code className="font-mono">Boxes Per CTN</code>,{' '}
              <code className="font-mono">Price Per Box (Rs)</code>) plus a reference sheet of valid
              Product Groups.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadProductExcelTemplate(groups)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#1E3A5F] bg-white border border-[#1E3A5F] rounded-lg hover:bg-[#E9EEF5] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 text-[#2563EB]" />
            <span>Download Excel Template (.xlsx)</span>
          </button>
        </div>

        {/* Step 2: Upload Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className="border-2 border-dashed border-[#CBD5E1] hover:border-[#1E3A5F] rounded-lg p-6 text-center bg-white transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="hidden"
          />
          <FileSpreadsheet className="w-8 h-8 text-[#1E3A5F] mx-auto mb-2" />
          <div className="text-sm font-bold text-[#0F172A]">
            {fileName ? `Loaded file: ${fileName}` : 'Drop your Excel (.xlsx / .csv) file here'}
          </div>
          <p className="text-xs text-[#475569] mt-1 mb-3">
            Every imported SKU is automatically linked in Active mode to all distributors of its Product Group.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{fileName ? 'Choose Another Excel File' : 'Select Excel File from Computer'}</span>
          </button>
        </div>

        {parseError && (
          <div className="p-3 bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-lg text-xs text-[#DC2626] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Step 3: Staging & Validation Preview Table */}
        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#0F172A]">
                Parsed Preview ({parsedRows.length} rows found · {validRows.length} ready to import)
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-[#0F172A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateExistingSkus}
                  onChange={(e) => setUpdateExistingSkus(e.target.checked)}
                  className="rounded border-[#CBD5E1]"
                />
                <span>Update existing SKUs if SKU Code already exists in catalog</span>
              </label>
            </div>

            <div className="border border-[#CBD5E1] rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                  <tr>
                    <th className="py-2 px-2.5">Row</th>
                    <th className="py-2 px-2.5">SKU Code</th>
                    <th className="py-2 px-2.5">Product Name</th>
                    <th className="py-2 px-2.5">Group</th>
                    <th className="py-2 px-2.5">Unit / Box</th>
                    <th className="py-2 px-2.5 text-right">Boxes/CTN</th>
                    <th className="py-2 px-2.5 text-right">Price/Box</th>
                    <th className="py-2 px-2.5 text-right">CTN Value</th>
                    <th className="py-2 px-2.5">Import Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1]">
                  {parsedRows.map((r) => {
                    const hasError = r.errors.length > 0;
                    const skipped = !hasError && r.isDuplicateInCatalog && !updateExistingSkus;
                    return (
                      <tr
                        key={r.rowIndex}
                        className={hasError ? 'bg-[#DC2626]/[0.05]' : 'hover:bg-[#F8FAFC]'}
                      >
                        <td className="py-2 px-2.5 font-mono text-[#475569]">#{r.rowIndex}</td>
                        <td className="py-2 px-2.5 font-mono font-semibold text-[#1E3A5F]">
                          {r.sku}
                        </td>
                        <td className="py-2 px-2.5 font-medium text-[#0F172A]">{r.name || '—'}</td>
                        <td className="py-2 px-2.5">
                          <ProductGroupTag groupName={r.groupName} />
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[#475569]">{r.unitPerBox}</td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums">
                          {r.boxesPerCtn}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums">
                          {formatPKR(r.pricePerBoxRs)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-[#1E3A5F] tabular-nums">
                          {formatPKR(r.boxesPerCtn * r.pricePerBoxRs)}
                        </td>
                        <td className="py-2 px-2.5">
                          {hasError ? (
                            <span className="inline-flex items-center gap-1 text-[#DC2626] font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{r.errors.join(', ')}</span>
                            </span>
                          ) : skipped ? (
                            <span className="text-[#475569]">Skipped (Existing SKU)</span>
                          ) : r.isDuplicateInCatalog ? (
                            <span className="inline-flex items-center gap-1 text-[#2563EB] font-semibold">
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Update Existing</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#16A34A] font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>New SKU (Auto-link)</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#CBD5E1]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={validRows.length === 0}
            onClick={handleConfirmImport}
            className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${
              validRows.length > 0
                ? 'bg-[#16A34A] hover:bg-[#16A34A]/90 cursor-pointer'
                : 'bg-[#CBD5E1] cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>
              Confirm & Import {validRows.length > 0 ? `${validRows.length} Product(s)` : ''}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
