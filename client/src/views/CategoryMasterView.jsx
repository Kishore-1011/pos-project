import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Edit2, Trash2, CheckCircle2, X, AlertTriangle, Tag, Layers, RefreshCw, Power, Plus, ShieldAlert, Check, AlertCircle
} from 'lucide-react';

export function CategoryMasterView({ onCategoryUpdated }) {
  const { authFetch, can } = useAuth();
  const isAdmin = can('items.manage');

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Category State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Inline Edit State
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editError, setEditError] = useState('');

  // Delete Guard Modal State
  const [deleteModalCategory, setDeleteModalCategory] = useState(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      setIsAdding(true);
      setAddError('');

      const res = await authFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create category');
      }

      setNewCategoryName('');
      showToast(`Category "${data.category?.name}" created successfully!`);
      loadCategories();
      if (onCategoryUpdated) onCategoryUpdated();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const startEditCategory = (cat) => {
    setEditingCategoryId(cat.id);
    setEditingName(cat.name);
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingCategoryId(null);
    setEditingName('');
    setEditError('');
  };

  const handleSaveRename = async (catId) => {
    if (!editingName.trim()) {
      setEditError('Category name cannot be empty');
      return;
    }

    try {
      const res = await authFetch(`/api/categories/${catId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editingName.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to rename category');
      }

      cancelEdit();
      showToast('Category renamed successfully!');
      loadCategories();
      if (onCategoryUpdated) onCategoryUpdated();
    } catch (err) {
      setEditError(err.message);
    }
  };

  const handleToggleStatus = async (cat) => {
    try {
      const newStatus = cat.is_active === 1 ? 0 : 1;
      const res = await authFetch(`/api/categories/${cat.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: newStatus })
      });

      if (res.ok) {
        showToast(`Category "${cat.name}" is now ${newStatus === 1 ? 'ACTIVE' : 'DEACTIVATED'}`);
        loadCategories();
        if (onCategoryUpdated) onCategoryUpdated();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update category status');
      }
    } catch (err) {
      alert('Error updating status: ' + err.message);
    }
  };

  const handleDeleteClick = (cat) => {
    setDeleteErrorMessage('');
    setDeleteModalCategory(cat);
  };

  const confirmDeleteCategory = async () => {
    if (!deleteModalCategory) return;

    try {
      setIsDeleting(true);
      setDeleteErrorMessage('');

      const res = await authFetch(`/api/categories/${deleteModalCategory.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) {
        setDeleteErrorMessage(data.error || 'Cannot delete category');
        return;
      }

      const deletedName = deleteModalCategory.name;
      setDeleteModalCategory(null);
      showToast(`Category "${deletedName}" deleted successfully!`);
      loadCategories();
      if (onCategoryUpdated) onCategoryUpdated();
    } catch (err) {
      setDeleteErrorMessage(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Header & Add Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600 dark:text-emerald-400" />
              <span>Category Master Management</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Create, rename, or toggle category visibility. Deactivated categories are hidden from the billing screen.
            </p>
          </div>

          <button
            onClick={loadCategories}
            title="Refresh categories"
            className="self-start md:self-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Add Category Input */}
        {isAdmin && (
          <form onSubmit={handleAddCategory} className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch gap-3">
            <div className="flex-1 relative">
              <Tag className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                placeholder="Enter new category name (e.g. Burgers, Combos, Desserts)..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={isAdding || !newCategoryName.trim()}
              className="px-5 py-2.5 bg-blue-600 dark:bg-emerald-500 hover:bg-blue-700 dark:hover:bg-emerald-600 disabled:opacity-50 text-white dark:text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 dark:shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{isAdding ? 'Adding...' : 'Add Category'}</span>
            </button>
          </form>
        )}

        {addError && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{addError}</span>
          </div>
        )}
      </div>

      {/* Category List & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Total Categories: <span className="font-black text-slate-900 dark:text-white">{categories.length}</span>
            <span className="ml-2 text-emerald-600 font-bold">({categories.filter(c => c.is_active === 1).length} Active)</span>
          </div>

          <div className="relative w-64">
            <input
              type="text"
              placeholder="Filter categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs font-semibold">Loading categories...</div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs font-semibold">
            {searchQuery ? 'No categories matching your filter.' : 'No categories found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/75 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-6">Category Name</th>
                  <th className="py-3 px-6 text-center">Active Status</th>
                  <th className="py-3 px-6 text-center">Assigned Items</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredCategories.map((cat) => {
                  const isEditing = editingCategoryId === cat.id;
                  const isActive = cat.is_active === 1;
                  const itemCount = Number(cat.item_count) || 0;
                  const activeItemCount = Number(cat.active_item_count) || 0;

                  return (
                    <tr 
                      key={cat.id} 
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        !isActive ? 'opacity-65 bg-slate-50/40 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      {/* Name or Inline Edit Input */}
                      <td className="py-3.5 px-6">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 max-w-sm">
                              <input
                                type="text"
                                autoFocus
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(cat.id);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-blue-500 text-xs font-bold text-slate-900 dark:text-white focus:outline-none ring-2 ring-blue-500/20"
                              />
                              <button
                                onClick={() => handleSaveRename(cat.id)}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 rounded-lg"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {editError && (
                              <span className="text-[10px] text-rose-500 font-semibold block">{editError}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-emerald-400"></span>
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{cat.name}</span>
                          </div>
                        )}
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-6 text-center">
                        <button
                          onClick={() => handleToggleStatus(cat)}
                          disabled={!isAdmin}
                          title={`Click to ${isActive ? 'Deactivate' : 'Activate'}`}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black transition-all cursor-pointer ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-300'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                        </button>
                      </td>

                      {/* Item Count */}
                      <td className="py-3.5 px-6 text-center">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {itemCount} items
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          ({activeItemCount} active in catalog)
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right">
                        {isAdmin && !isEditing && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEditCategory(cat)}
                              title="Rename Category"
                              className="px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Rename</span>
                            </button>

                            <button
                              onClick={() => handleDeleteClick(cat)}
                              title="Delete Category"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation / Protection Modal */}
      {deleteModalCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Delete Category: {deleteModalCategory.name}
                </h3>
                <span className="text-xs text-slate-400">Verification & Safety Check</span>
              </div>
            </div>

            {deleteErrorMessage ? (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>{deleteErrorMessage}</span>
                </div>
                <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/60 flex items-center justify-between">
                  <span>Recommendation: Toggle category to <strong>Inactive</strong> instead.</span>
                  <button
                    onClick={() => {
                      handleToggleStatus(deleteModalCategory);
                      setDeleteModalCategory(null);
                    }}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold"
                  >
                    Deactivate Now
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete category <strong>"{deleteModalCategory.name}"</strong>? This action cannot be undone.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalCategory(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Close
              </button>
              
              {!deleteErrorMessage && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={confirmDeleteCategory}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-500/20"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
