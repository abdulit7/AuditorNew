import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Store,
  Smartphone,
  CheckCircle2,
  Lock,
  Plus,
} from 'lucide-react';
import {
  AppUser,
  City,
  Territory,
  LocationItem,
  SubLocation,
  Shop,
  Distributor,
  Product,
  AuditFormDefinition,
  DistributorProductAuditReport,
  RetailMarketShopAuditReport,
  ActivePageId,
} from '../../types/infrastructure';
import { DistributorProductAuditMobileForm } from './DistributorProductAuditMobileForm';
import { FormConfigEditor } from './FormConfigEditor';
import { CustomFormBuilder } from './CustomFormBuilder';
import type { FormConfigMap, FormConfigPayload } from '../../types/formConfig';

interface AuditFormsAndReportsPageProps {
  users: AppUser[];
  cities: City[];
  territories: Territory[];
  locations: LocationItem[];
  subLocations: SubLocation[];
  shops: Shop[];
  distributors: Distributor[];
  products: Product[];
  auditForms: AuditFormDefinition[];
  formConfigs: FormConfigMap;
  canEditForms: boolean;
  onFormConfigSaved: (config: FormConfigPayload) => void;
  onFormUpdated: (form: AuditFormDefinition) => void;
  onFormCreated: (form: AuditFormDefinition, config: FormConfigPayload) => void;
  onFormDeleted: (formId: string) => void;
  onAddAuditReport: (report: DistributorProductAuditReport) => Promise<DistributorProductAuditReport>;
  onAddRetailShopReport: (report: RetailMarketShopAuditReport) => Promise<RetailMarketShopAuditReport>;
  selectedMobileAuditorId: string;
  setSelectedMobileAuditorId: (id: string) => void;
  onNavigate: (page: ActivePageId) => void;
  onToast: (message: string) => void;
}

export function AuditFormsAndReportsPage({
  users,
  cities,
  territories,
  locations,
  subLocations,
  shops,
  distributors,
  products,
  auditForms,
  formConfigs,
  canEditForms,
  onFormConfigSaved,
  onFormUpdated,
  onFormCreated,
  onFormDeleted,
  onAddAuditReport,
  onAddRetailShopReport,
  selectedMobileAuditorId,
  setSelectedMobileAuditorId,
  onNavigate,
  onToast,
}: AuditFormsAndReportsPageProps) {
  const [selectedFormId, setSelectedFormId] = useState<string>(
    auditForms[0]?.id || 'form-distributor-product-audit'
  );

  const mobileEligibleUsers = users.filter((u) => u.userType === 'mobile');
  const activeAuditor =
    mobileEligibleUsers.find((u) => u.id === selectedMobileAuditorId) ||
    mobileEligibleUsers[0] ||
    users[0];

  const [creating, setCreating] = useState(false);
  const selectedForm =
    auditForms.find((f) => f.id === selectedFormId) || auditForms[0];

  const handleReportSubmittedFromPreview = async (newReport: DistributorProductAuditReport) => {
    const saved = await onAddAuditReport(newReport);
    onToast(`Audit Report ${saved.reportCode} submitted for ${saved.distributorSetupName}.`);
    onNavigate('reports');
    return saved;
  };

  const handleRetailShopReportSubmittedFromPreview = async (
    newReport: RetailMarketShopAuditReport
  ) => {
    const saved = await onAddRetailShopReport(newReport);
    onToast(`Retail Shop Audit Report ${saved.reportCode} submitted for ${saved.subLocationName}.`);
    onNavigate('reports');
    return saved;
  };

  return (
    <div className="space-y-6">
      {/* Main 2-Column Split: Left = All Forms List, Right = Live Mobile View of Selected Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 Cols): All Audit Forms List */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <div>
                <h1 className="text-lg font-bold text-[#0F172A]">
                  Audit Forms ({auditForms.length})
                </h1>
                <p className="text-xs text-[#475569]">
                  Select a form below to preview and operate its mobile layout on the right.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canEditForms && (
                  <button type="button" onClick={() => setCreating(true)} className="min-h-[36px] px-3 rounded-md bg-[#1E3A5F] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />New form
                  </button>
                )}
                <label className="text-xs font-semibold text-[#475569]">
                  Auditor Scope:
                </label>
                <select
                  value={activeAuditor.id}
                  onChange={(e) => setSelectedMobileAuditorId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-md text-[#0F172A]"
                >
                  {mobileEligibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {auditForms.map((form) => {
                const isSelected = form.id === selectedForm.id;
                const isRetailForm = form.id === 'form-retail-market-shop-audit';

                return (
                  <div
                    key={form.id}
                    onClick={() => setSelectedFormId(form.id)}
                    className={`p-4 rounded-xl border-2 transition-colors cursor-pointer space-y-3 ${
                      isSelected
                        ? 'border-[#1E3A5F] bg-[#F8FAFC]'
                        : 'border-[#CBD5E1] bg-white hover:border-[#94A3B8]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#1E3A5F] text-white flex items-center justify-center shrink-0">
                          {isRetailForm ? (
                            <Store className="w-5 h-5" />
                          ) : (
                            <FileSpreadsheet className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                              {form.code}
                            </span>
                            <span className="text-sm font-bold text-[#0F172A]">
                              {form.title}
                            </span>
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5">
                            Category: {form.category} · Updated {form.updatedAt}
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16A34A]">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{form.status}</span>
                      </span>
                    </div>

                    <p className="text-xs text-[#475569] leading-relaxed">
                      {form.description}
                    </p>

                    {form.kind === 'custom' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#CBD5E1] text-[11px]">
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]"><span className="text-[#475569] block">Audits a</span><span className="font-bold text-[#1E3A5F]">{form.target === 'shop' ? 'Shop' : form.target === 'subLocation' ? 'Market area' : 'Distributor'}</span></div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]"><span className="text-[#475569] block">Questions</span><span className="font-bold text-[#0F172A]">{formConfigs[form.id]?.fields.length ?? '…'}</span></div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]"><span className="text-[#475569] block">Auditors</span><span className="font-bold text-[#0F172A]">All (by territory)</span></div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]"><span className="text-[#475569] block">Version</span><span className="font-bold text-[#16A34A]">v{formConfigs[form.id]?.version ?? 1}</span></div>
                      </div>
                    ) : isRetailForm ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#CBD5E1] text-[11px]">
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Hierarchy Scope</span>
                          <span className="font-bold text-[#1E3A5F]">
                            City → Sub-location
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Shop Popup Fields</span>
                          <span className="font-bold text-[#0F172A]">
                            Prod-A/B · Display · Reg
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Shop GPS Capture</span>
                          <span className="font-bold text-[#1E3A5F]">
                            On Shop Save
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Power-Off Recovery</span>
                          <span className="font-bold text-[#16A34A]">
                            Auto-Saved Locally
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#CBD5E1] text-[11px]">
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Background GPS</span>
                          <span className="font-bold text-[#1E3A5F]">
                            Required (Silent)
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Distributor Scope</span>
                          <span className="font-bold text-[#0F172A]">
                            Auditor Territories
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Master Fields</span>
                          <span className="font-bold text-[#0F172A] flex items-center gap-1">
                            <Lock className="w-3 h-3 text-[#1E3A5F]" /> Locked
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#CBD5E1]">
                          <span className="text-[#475569] block">Same SKU Repeat</span>
                          <span className="font-bold text-[#16A34A]">
                            Multi-Batch Allowed
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {creating ? (
            <CustomFormBuilder
              canEdit={canEditForms}
              onToast={onToast}
              onCancelNew={() => setCreating(false)}
              onCreated={(f, c) => { onFormCreated(f, c); setSelectedFormId(f.id); setCreating(false); }}
              onSaved={() => undefined}
              onDeleted={() => undefined}
            />
          ) : selectedForm.kind === 'custom' ? (
            <CustomFormBuilder
              form={selectedForm}
              config={formConfigs[selectedForm.id]}
              canEdit={canEditForms}
              onToast={onToast}
              onCreated={() => undefined}
              onSaved={(f, c) => { onFormUpdated(f); onFormConfigSaved(c); }}
              onDeleted={(id) => { onFormDeleted(id); setSelectedFormId(auditForms.find((x) => x.id !== id)?.id || ''); }}
            />
          ) : (
          <FormConfigEditor
            form={selectedForm}
            config={formConfigs[selectedForm.id]}
            canEdit={canEditForms}
            onSaved={onFormConfigSaved}
            onFormUpdated={onFormUpdated}
            onToast={onToast}
          />
          )}
        </div>

        {/* Right Column (5 Cols): Live Mobile View of Selected Form */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[430px] mb-2 flex items-center justify-between text-xs font-semibold text-[#475569] px-1">
            <span className="flex items-center gap-1.5 text-[#1E3A5F]">
              <Smartphone className="w-4 h-4" />
              Mobile View: {selectedForm.title}
            </span>
          </div>

          <div className="w-full max-w-[430px] bg-[#F2F6FC] border-2 border-[#0046B8] rounded-2xl overflow-hidden shadow-md flex flex-col min-h-[720px] max-h-[840px]">
            {/* Mobile Form Body */}
            <div className="flex-1 overflow-y-auto">
              <DistributorProductAuditMobileForm
                activeAuditor={activeAuditor}
                cities={cities}
                territories={territories}
                locations={locations}
                subLocations={subLocations}
                shops={shops}
                distributors={distributors}
                products={products}
                auditForms={auditForms}
                formConfigs={formConfigs}
                onSubmitReport={handleReportSubmittedFromPreview}
                onSubmitRetailShopReport={handleRetailShopReportSubmittedFromPreview}
                locationEnabled={true}
                initialOpenForm={true}
                initialFormId={selectedForm.id}
                onToast={onToast}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
