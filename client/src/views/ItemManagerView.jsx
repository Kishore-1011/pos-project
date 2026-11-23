import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CategoryMasterView } from './CategoryMasterView';
import { Plus, Edit2, X, Utensils, Image as ImageIcon, Upload, CheckSquare, Square, CheckCircle2, Tag, IndianRupee, Layers, Check } from 'lucide-react';

export function ItemManagerView() {
  const { authFetch, user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState('items'); // 'items' | 'categories'
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Multi-Select State
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  // Modal / Editing state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Bulk Modals
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkPriceMode, setBulkPriceMode] = useState('FIXED'); // 'FIXED' | 'FLAT_INC' | 'FLAT_DEC' | 'PERCENT_INC' | 'PERCENT_DEC'
  const [bulkPriceValue, setBulkPriceValue] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Toast
  const [successToast, setSuccessToast] = useState('');

  // Single Item Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

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
      console.error('Failed to load menu items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!name || price === '') return;

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('price', price);
      if (categoryId) formData.append('category_id', categoryId);
      if (selectedFile) formData.append('image', selectedFile);

      const url = editingItem ? `/api/items/${editingItem.id}` : '/api/items';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method: method,
        body: formData
      });

      if (res.ok) {
        setShowAddModal(false);
        setEditingItem(null);
        setName('');
        setPrice('');
        setCategoryId('');
        setSelectedFile(null);
        setPreviewUrl('');
        setSuccessToast(editingItem ? 'Item updated successfully!' : 'Item created successfully!');
        setTimeout(() => setSuccessToast(''), 3000);
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Operation failed');
      }
    } catch (err) {
      alert('Error saving item: ' + err.message);
    }
  };

  const handleToggleStatus = async (item) => {
    try {
      const res = await authFetch(`/api/items/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !item.is_active })
      });
      if (res.ok) {
        setSuccessToast(`Item status updated`);
        setTimeout(() => setSuccessToast(''), 2500);
        loadData();
      }
    } catch (err) {
      console.error('Toggle status error:', err);
    }
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(String(item.price));
    setCategoryId(item.category_id ? String(item.category_id) : '');
    setSelectedFile(null);
    setPreviewUrl(item.image_url ? `http://localhost:5000${item.image_url}` : '');
    setShowAddModal(true);
  };

  // Selection Handlers
  const isAllSelected = items.length > 0 && selectedItemIds.length === items.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(items.map(i => i.id));
    }
  };

  const handleToggleSelectItem = (id) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Bulk Operations
  const handleBulkStatus = async (isActive) => {
    if (selectedItemIds.length === 0) return;
    try {
      setBulkSubmitting(true);
      const res = await authFetch('/api/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({
          item_ids: selectedItemIds,
          action: 'STATUS',
          value: { is_active: isActive ? 1 : 0 }
        })
      });

      if (res.ok) {
        setSuccessToast(`Updated status for ${selectedItemIds.length} items!`);
        setTimeout(() => setSuccessToast(''), 3000);
        setSelectedItemIds([]);
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Bulk update failed');
      }
    } catch (err) {
      alert('Bulk status error: ' + err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkCategorySubmit = async (e) => {
    e.preventDefault();
    if (selectedItemIds.length === 0) return;

    try {
      setBulkSubmitting(true);
      const res = await authFetch('/api/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({
          item_ids: selectedItemIds,
          action: 'CATEGORY',
          value: { category_id: bulkCategoryId || null }
        })
      });

      if (res.ok) {
        setShowBulkCategoryModal(false);
        setBulkCategoryId('');
        setSuccessToast(`Reassigned category for ${selectedItemIds.length} items!`);
        setTimeout(() => setSuccessToast(''), 3000);
        setSelectedItemIds([]);
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Bulk category update failed');
      }
    } catch (err) {
      alert('Bulk category error: ' + err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkPriceSubmit = async (e) => {
    e.preventDefault();
    if (selectedItemIds.length === 0 || bulkPriceValue === '') return;

    const val = parseFloat(bulkPriceValue);
    if (isNaN(val) || (bulkPriceMode === 'FIXED' && val < 0)) {
      alert('Please enter a valid price amount');
      return;
    }

    try {
      setBulkSubmitting(true);
      const payload = {
        item_ids: selectedItemIds,
        action: 'PRICE',
        value: {
          mode: bulkPriceMode,
          price: bulkPriceMode === 'FIXED' ? val : undefined,
          amount: ['FLAT_INC', 'FLAT_DEC'].includes(bulkPriceMode) ? val : undefined,
          percentage: ['PERCENT_INC', 'PERCENT_DEC'].includes(bulkPriceMode) ? val : undefined
        }
      };

      const res = await authFetch('/api/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowBulkPriceModal(false);
        setBulkPriceValue('');
        setSuccessToast(`Price updated for ${selectedItemIds.length} items!`);
        setTimeout(() => setSuccessToast(''), 3000);
        setSelectedItemIds([]);
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Bulk price update failed');
      }
    } catch (err) {
      alert('Bulk price error: ' + err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
      
      {/* Toast */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header with Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Utensils className="w-5 h-5 text-blue-600" />
            <span>Menu & Category Management</span>
          </h2>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setActiveSubTab('items')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSubTab === 'items'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Menu Items ({items.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('categories')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSubTab === 'categories'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Category Master ({categories.length})</span>
            </button>
          </div>
        </div>

        {activeSubTab === 'items' && (
          <button
            onClick={() => {
              setEditingItem(null);
              setName('');
              setPrice('');
              setCategoryId('');
              setSelectedFile(null);
              setPreviewUrl('');
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Menu Item</span>
          </button>
        )}
      </div>

      {activeSubTab === 'categories' ? (
        <CategoryMasterView onCategoryUpdated={loadData} />
      ) : (
        <>

      {/* Sticky/Floating Bulk Action Bar */}
      {selectedItemIds.length > 0 && (
        <div className="sticky top-16 z-30 mb-4 p-3.5 bg-white border border-blue-100 shadow-xl rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-black border border-blue-200">
              {selectedItemIds.length}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {selectedItemIds.length === 1 ? '1 item selected' : `${selectedItemIds.length} items selected`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bulk Status: Active */}
            <button
              onClick={() => handleBulkStatus(true)}
              disabled={bulkSubmitting}
              className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Set Active</span>
            </button>

            {/* Bulk Status: Disabled */}
            <button
              onClick={() => handleBulkStatus(false)}
              disabled={bulkSubmitting}
              className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <X className="w-3.5 h-3.5 text-rose-600" />
              <span>Set Disabled</span>
            </button>

            {/* Bulk Category */}
            <button
              onClick={() => setShowBulkCategoryModal(true)}
              disabled={bulkSubmitting}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
            >
              <Layers className="w-3.5 h-3.5 text-blue-200" />
              <span>Update Category</span>
            </button>

            {/* Bulk Price */}
            <button
              onClick={() => setShowBulkPriceModal(true)}
              disabled={bulkSubmitting}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
            >
              <IndianRupee className="w-3.5 h-3.5 text-blue-200" />
              <span>Update Price</span>
            </button>

            {/* Clear Selection */}
            <button
              onClick={() => setSelectedItemIds([])}
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all ml-1"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm font-semibold">Loading item master...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 w-10">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-slate-500 hover:text-blue-600 flex items-center"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5">Image</th>
                  <th className="px-5 py-3.5">Item Name</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Price (₹)</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectItem(item.id)}
                          className="text-slate-500 hover:text-blue-600 flex items-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {item.image_url ? (
                          <img
                            src={`http://localhost:5000${item.image_url}`}
                            alt={item.name}
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-200">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-900">{item.name}</td>
                      <td className="px-5 py-4 text-slate-500 font-semibold">{item.category_name || 'Uncategorized'}</td>
                      <td className="px-5 py-4 font-bold text-blue-600 tabular-nums">₹{item.price.toFixed(2)}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          item.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {item.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 border border-slate-200"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 ${
                            item.is_active
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200'
                          }`}
                        >
                          {item.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Single Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingItem ? 'Edit Item Master' : 'Add New Item to Master'}
            </h3>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Masala Dosa"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Price (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm font-bold text-blue-600 tabular-nums outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none"
                >
                  <option value="">-- Uncategorized --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.is_active === 0 ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Local File Upload Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Item Image (Local Storage)
                </label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Choose Local Image File</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                    />
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md hover:bg-blue-700"
                >
                  {editingItem ? 'Update Item' : 'Create Item'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Bulk Category Modal */}
      {showBulkCategoryModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowBulkCategoryModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <Layers className="w-5 h-5" />
              <h3 className="text-lg font-bold text-slate-900">Bulk Reassign Category</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Select the new category for the <strong>{selectedItemIds.length} selected items</strong>.
            </p>

            <form onSubmit={handleBulkCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Target Category</label>
                <select
                  value={bulkCategoryId}
                  onChange={(e) => setBulkCategoryId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none"
                >
                  <option value="">-- Uncategorized --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.is_active === 0 ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={bulkSubmitting}
                  onClick={() => setShowBulkCategoryModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{bulkSubmitting ? 'Updating...' : `Update ${selectedItemIds.length} Items`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Price Modal */}
      {showBulkPriceModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowBulkPriceModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <IndianRupee className="w-5 h-5" />
              <h3 className="text-lg font-bold text-slate-900">Bulk Price Adjustment</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Apply a new price or adjustment for <strong>{selectedItemIds.length} selected items</strong>.
            </p>

            <form onSubmit={handleBulkPriceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Adjustment Type</label>
                <select
                  value={bulkPriceMode}
                  onChange={(e) => setBulkPriceMode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none"
                >
                  <option value="FIXED">Set Exact Price (e.g. ₹50)</option>
                  <option value="FLAT_INC">Increase by Flat Amount (+₹)</option>
                  <option value="FLAT_DEC">Decrease by Flat Amount (-₹)</option>
                  <option value="PERCENT_INC">Increase by Percentage (+%)</option>
                  <option value="PERCENT_DEC">Decrease by Percentage (-%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {bulkPriceMode === 'FIXED' ? 'New Price (₹)' : bulkPriceMode.startsWith('PERCENT') ? 'Percentage (%)' : 'Amount (₹)'}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  value={bulkPriceValue}
                  onChange={(e) => setBulkPriceValue(e.target.value)}
                  placeholder={bulkPriceMode.startsWith('PERCENT') ? '10' : '5.00'}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none tabular-nums"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={bulkSubmitting}
                  onClick={() => setShowBulkPriceModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>{bulkSubmitting ? 'Updating...' : `Update ${selectedItemIds.length} Items`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
}
