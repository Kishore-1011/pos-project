import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  useToast, Button, Badge, Card, PageHeader, TextInput, Select, MoneyInput, Modal, EmptyState
} from '../components/ui';
import { ItemArt } from '../components/ItemArt';
import { formatMoney } from '../utils/format';
import { CategoryMasterView } from './CategoryMasterView';
import {
  Plus, Edit2, X, Package, Upload, CheckSquare, Square, IndianRupee, Layers, Check, Tag
} from 'lucide-react';

// Uploaded photos are stored as /uploads/... (same origin as the app); keep absolute URLs as they are.
const resolveImageUrl = (url) => {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

const EMPTY_FORM = { name: '', price: '', categoryId: '', allowPriceChange: false };

export function ItemManagerView() {
  const { authFetch } = useAuth();
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState('items'); // 'items' | 'categories'
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Multi-select
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  // Add / edit
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Bulk
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkPriceMode, setBulkPriceMode] = useState('FIXED'); // FIXED | FLAT_INC | FLAT_DEC | PERCENT_INC | PERCENT_DEC
  const [bulkPriceValue, setBulkPriceValue] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/items');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to load items:', err);
      toast.error('Could not load items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const openAdd = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setPreviewUrl('');
    setFormError('');
    setShowAddModal(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      price: String(item.price),
      categoryId: item.category_id ? String(item.category_id) : '',
      allowPriceChange: item.allow_price_change === 1 || item.allow_price_change === true
    });
    setSelectedFile(null);
    setPreviewUrl(resolveImageUrl(item.image_url));
    setFormError('');
    setShowAddModal(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Enter an item name');
      return;
    }
    if (form.price === '' || Number.isNaN(Number(form.price))) {
      setFormError('Enter a price');
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('price', form.price);
      formData.append('category_id', form.categoryId || '');
      formData.append('allow_price_change', form.allowPriceChange ? 'true' : 'false');
      if (selectedFile) formData.append('image', selectedFile);

      const res = await authFetch(editingItem ? `/api/items/${editingItem.id}` : '/api/items', {
        method: editingItem ? 'PUT' : 'POST',
        body: formData
      });

      if (res.ok) {
        setShowAddModal(false);
        toast.success(editingItem ? `${form.name.trim()} updated` : `${form.name.trim()} added`);
        setEditingItem(null);
        loadData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setFormError(errData.error || 'Could not save the item');
      }
    } catch (err) {
      setFormError(`Could not save the item: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item) => {
    try {
      const res = await authFetch(`/api/items/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !item.is_active })
      });
      if (res.ok) {
        toast.success(item.is_active ? `${item.name} hidden from billing` : `${item.name} available for billing`);
        loadData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Could not change the item status');
      }
    } catch (err) {
      toast.error(`Could not change the item status: ${err.message}`);
    }
  };

  // Selection
  const isAllSelected = items.length > 0 && selectedItemIds.length === items.length;
  const handleToggleSelectAll = () => setSelectedItemIds(isAllSelected ? [] : items.map((i) => i.id));
  const handleToggleSelectItem = (id) =>
    setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Bulk operations
  const runBulk = async (payload, successMessage, after) => {
    if (selectedItemIds.length === 0) return;
    try {
      setBulkSubmitting(true);
      const res = await authFetch('/api/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ item_ids: selectedItemIds, ...payload })
      });
      if (res.ok) {
        toast.success(successMessage);
        if (after) after();
        setSelectedItemIds([]);
        loadData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Bulk update failed');
      }
    } catch (err) {
      toast.error(`Bulk update failed: ${err.message}`);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const n = selectedItemIds.length;
  const itemsWord = n === 1 ? '1 item' : `${n} items`;

  const handleBulkStatus = (isActive) =>
    runBulk({ action: 'STATUS', value: { is_active: isActive ? 1 : 0 } },
      isActive ? `${itemsWord} available for billing` : `${itemsWord} hidden from billing`);

  const handleBulkCategorySubmit = (e) => {
    e.preventDefault();
    runBulk({ action: 'CATEGORY', value: { category_id: bulkCategoryId || null } },
      `Category changed for ${itemsWord}`,
      () => { setShowBulkCategoryModal(false); setBulkCategoryId(''); });
  };

  const handleBulkPriceSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(bulkPriceValue);
    if (bulkPriceValue === '' || Number.isNaN(val) || val < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    runBulk({
      action: 'PRICE',
      value: {
        mode: bulkPriceMode,
        price: bulkPriceMode === 'FIXED' ? val : undefined,
        amount: ['FLAT_INC', 'FLAT_DEC'].includes(bulkPriceMode) ? val : undefined,
        percentage: ['PERCENT_INC', 'PERCENT_DEC'].includes(bulkPriceMode) ? val : undefined
      }
    }, `Price updated for ${itemsWord}`, () => { setShowBulkPriceModal(false); setBulkPriceValue(''); });
  };

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: `${c.name}${c.is_active === 0 ? ' (hidden)' : ''}`
  }));

  const tabClass = (tab) =>
    `px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
      activeSubTab === tab
        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
        : 'bg-slate-100 text-ink-muted hover:bg-slate-200'
    }`;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        icon={Package}
        title="Items"
        subtitle="What you sell, with prices and photos. Hidden items don't appear on the billing screen."
        actions={activeSubTab === 'items' && <Button icon={Plus} onClick={openAdd}>Add item</Button>}
      />

      <div className="flex items-center gap-2 mb-5" role="tablist" aria-label="Items and categories">
        <button type="button" role="tab" aria-selected={activeSubTab === 'items'} onClick={() => setActiveSubTab('items')} className={tabClass('items')}>
          <Package className="w-3.5 h-3.5" />
          <span>Items ({items.length})</span>
        </button>
        <button type="button" role="tab" aria-selected={activeSubTab === 'categories'} onClick={() => setActiveSubTab('categories')} className={tabClass('categories')}>
          <Layers className="w-3.5 h-3.5" />
          <span>Categories ({categories.length})</span>
        </button>
      </div>

      {activeSubTab === 'categories' ? (
        <CategoryMasterView onCategoryUpdated={loadData} />
      ) : (
        <>
          {/* Bulk action bar */}
          {n > 0 && (
            <Card className="sticky top-0 z-30 mb-4 p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg border-brand-200">
              <div className="flex items-center gap-2.5">
                <Badge tone="brand">{n}</Badge>
                <span className="text-sm font-semibold text-ink">{itemsWord} selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" icon={Check} disabled={bulkSubmitting} onClick={() => handleBulkStatus(true)}>Show in billing</Button>
                <Button size="sm" variant="danger-quiet" icon={X} disabled={bulkSubmitting} onClick={() => handleBulkStatus(false)}>Hide from billing</Button>
                <Button size="sm" icon={Layers} disabled={bulkSubmitting} onClick={() => setShowBulkCategoryModal(true)}>Change category</Button>
                <Button size="sm" icon={IndianRupee} disabled={bulkSubmitting} onClick={() => setShowBulkPriceModal(true)}>Change price</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedItemIds([])}>Clear selection</Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            {loading ? (
              <p className="p-8 text-center text-sm text-ink-muted">Loading items…</p>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No items yet"
                message="Add the things you sell. They show up on the billing screen straight away."
                action={<Button icon={Plus} onClick={openAdd}>Add item</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-ink">
                  <thead className="bg-slate-50 text-xs text-ink-muted font-semibold border-b border-line">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <button type="button" onClick={handleToggleSelectAll} aria-label={isAllSelected ? 'Clear selection' : 'Select all items'}
                          className="flex items-center text-ink-subtle hover:text-brand-600 cursor-pointer">
                          {isAllSelected ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
                        </button>
                      </th>
                      <th className="px-3 py-3">Item</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((item) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const openPrice = item.allow_price_change === 1 || item.allow_price_change === true;
                      return (
                        <tr key={item.id} className={`transition-colors ${isSelected ? 'bg-brand-50/60' : 'hover:bg-slate-50/80'}`}>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => handleToggleSelectItem(item.id)}
                              aria-label={isSelected ? `Unselect ${item.name}` : `Select ${item.name}`}
                              className="flex items-center text-ink-subtle hover:text-brand-600 cursor-pointer">
                              {isSelected ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-3">
                              <ItemArt item={item} src={resolveImageUrl(item.image_url)}
                                className="w-14 h-14 rounded-xl flex-shrink-0 border border-line" iconClassName="w-6 h-6" />
                              <div className="min-w-0">
                                <p className={`font-bold truncate ${item.is_active ? 'text-ink' : 'text-ink-subtle'}`}>{item.name}</p>
                                {openPrice && (
                                  <Badge tone="warning" className="mt-1"><Tag className="w-3 h-3" aria-hidden="true" />Price can change at billing</Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-ink-muted">{item.category_name || 'Uncategorised'}</td>
                          <td className="px-4 py-3 text-right font-bold text-brand-700 tabular-nums">{formatMoney(item.price)}</td>
                          <td className="px-4 py-3">
                            <Badge tone={item.is_active ? 'success' : 'neutral'}>{item.is_active ? 'In billing' : 'Hidden'}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="secondary" icon={Edit2} onClick={() => openEdit(item)}>Edit</Button>
                              {item.is_active ? (
                                <Button size="sm" variant="danger-quiet" onClick={() => handleToggleStatus(item)}>Hide</Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(item)}>Show</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Add / edit item */}
          <Modal
            open={showAddModal}
            onClose={() => setShowAddModal(false)}
            title={editingItem ? `Edit ${editingItem.name}` : 'Add item'}
            icon={Package}
            footer={
              <>
                <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
                <Button type="submit" form="item-form" loading={saving}>{editingItem ? 'Save changes' : 'Add item'}</Button>
              </>
            }
          >
            <form id="item-form" onSubmit={handleSaveItem} className="space-y-4">
              <div className="flex items-center gap-4">
                <ItemArt
                  item={{ name: form.name, category_name: categories.find((c) => String(c.id) === form.categoryId)?.name }}
                  src={previewUrl}
                  className="w-20 h-20 rounded-2xl flex-shrink-0 border border-line"
                  iconClassName="w-8 h-8"
                />
                <div>
                  <label className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-line bg-surface hover:bg-slate-50 text-sm font-semibold text-ink cursor-pointer">
                    <Upload className="w-4 h-4 text-brand-600" aria-hidden="true" />
                    {previewUrl ? 'Change photo' : 'Add photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} className="sr-only" />
                  </label>
                  <p className="text-xs text-ink-subtle mt-1.5">JPEG, PNG, WebP or GIF, up to 5 MB. Without a photo the item gets a designed tile.</p>
                </div>
              </div>

              <TextInput label="Name" required value={form.name} onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. Masala Dosa" data-autofocus />

              <div className="grid grid-cols-2 gap-3">
                <MoneyInput label="Price" required value={form.price} onChange={(v) => setField('price', v)} placeholder="0.00" />
                <Select label="Category" value={form.categoryId} onChange={(e) => setField('categoryId', e.target.value)}
                  placeholder="Uncategorised" options={categoryOptions} />
              </div>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-slate-50/60 cursor-pointer">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={form.allowPriceChange}
                  checked={form.allowPriceChange}
                  onChange={(e) => setField('allowPriceChange', e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">Allow price change at billing</span>
                  <span className="block text-xs text-ink-muted mt-0.5">
                    For open-price items like repairs or custom orders. Only staff with permission can change it, and every change is recorded.
                  </span>
                </span>
              </label>

              {formError && <p className="text-sm font-medium text-rose-600" role="alert">{formError}</p>}
            </form>
          </Modal>

          {/* Bulk category */}
          <Modal
            open={showBulkCategoryModal}
            onClose={() => setShowBulkCategoryModal(false)}
            title="Change category"
            description={`Move ${itemsWord} to another category.`}
            icon={Layers}
            size="sm"
            footer={
              <>
                <Button variant="secondary" disabled={bulkSubmitting} onClick={() => setShowBulkCategoryModal(false)}>Cancel</Button>
                <Button type="submit" form="bulk-category-form" loading={bulkSubmitting}>Move {itemsWord}</Button>
              </>
            }
          >
            <form id="bulk-category-form" onSubmit={handleBulkCategorySubmit}>
              <Select label="New category" value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}
                placeholder="Uncategorised" options={categoryOptions} />
            </form>
          </Modal>

          {/* Bulk price */}
          <Modal
            open={showBulkPriceModal}
            onClose={() => setShowBulkPriceModal(false)}
            title="Change price"
            description={`Set or adjust the price of ${itemsWord}.`}
            icon={IndianRupee}
            size="sm"
            footer={
              <>
                <Button variant="secondary" disabled={bulkSubmitting} onClick={() => setShowBulkPriceModal(false)}>Cancel</Button>
                <Button type="submit" form="bulk-price-form" loading={bulkSubmitting}>Update {itemsWord}</Button>
              </>
            }
          >
            <form id="bulk-price-form" onSubmit={handleBulkPriceSubmit} className="space-y-4">
              <Select
                label="How"
                value={bulkPriceMode}
                onChange={(e) => setBulkPriceMode(e.target.value)}
                options={[
                  { value: 'FIXED', label: 'Set an exact price' },
                  { value: 'FLAT_INC', label: 'Increase by an amount (+₹)' },
                  { value: 'FLAT_DEC', label: 'Decrease by an amount (−₹)' },
                  { value: 'PERCENT_INC', label: 'Increase by a percentage (+%)' },
                  { value: 'PERCENT_DEC', label: 'Decrease by a percentage (−%)' }
                ]}
              />
              {bulkPriceMode.startsWith('PERCENT') ? (
                <TextInput label="Percentage" type="text" inputMode="decimal" required value={bulkPriceValue}
                  onChange={(e) => setBulkPriceValue(e.target.value.replace(/[^\d.]/g, ''))} placeholder="10" />
              ) : (
                <MoneyInput label={bulkPriceMode === 'FIXED' ? 'New price' : 'Amount'} required value={bulkPriceValue}
                  onChange={(v) => setBulkPriceValue(v)} placeholder="0.00" />
              )}
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}
