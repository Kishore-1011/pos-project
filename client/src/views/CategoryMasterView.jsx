import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, Button, Badge, Card, TextInput, Modal, EmptyState } from '../components/ui';
import { itemTileStyle } from '../utils/itemStyle';
import { Edit2, Trash2, X, AlertTriangle, Tag, Layers, RefreshCw, Plus, Check, Search, EyeOff, Eye } from 'lucide-react';

/** Small category swatch: the same colour and icon the billing screen uses for the category. */
function CategoryArt({ name }) {
  const { palette, Icon } = itemTileStyle({ category_name: name });
  return (
    <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${palette} flex items-center justify-center flex-shrink-0`} aria-hidden="true">
      <Icon className="w-5 h-5 opacity-80" strokeWidth={1.75} />
    </span>
  );
}

export function CategoryMasterView({ onCategoryUpdated }) {
  const { authFetch, can } = useAuth();
  const toast = useToast();
  const canManage = can('items.manage');

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Inline rename
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editError, setEditError] = useState('');

  // Delete
  const [deleteModalCategory, setDeleteModalCategory] = useState(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const changed = () => { if (onCategoryUpdated) onCategoryUpdated(); };

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
      toast.error('Could not load categories');
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
      const res = await authFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name: newCategoryName.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add the category');
      setNewCategoryName('');
      toast.success(`Category ${data.category?.name || ''} added`);
      loadCategories();
      changed();
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
      setEditError('Enter a name');
      return;
    }
    try {
      const res = await authFetch(`/api/categories/${catId}`, { method: 'PUT', body: JSON.stringify({ name: editingName.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not rename the category');
      cancelEdit();
      toast.success('Category renamed');
      loadCategories();
      changed();
    } catch (err) {
      setEditError(err.message);
    }
  };

  const handleToggleStatus = async (cat) => {
    try {
      const newStatus = cat.is_active === 1 ? 0 : 1;
      const res = await authFetch(`/api/categories/${cat.id}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: newStatus }) });
      if (res.ok) {
        toast.success(newStatus === 1 ? `${cat.name} is back on the billing screen` : `${cat.name} hidden from the billing screen`);
        loadCategories();
        changed();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not change the category');
      }
    } catch (err) {
      toast.error(`Could not change the category: ${err.message}`);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deleteModalCategory) return;
    try {
      setIsDeleting(true);
      setDeleteErrorMessage('');
      const res = await authFetch(`/api/categories/${deleteModalCategory.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteErrorMessage(data.error || 'This category cannot be deleted');
        return;
      }
      toast.success(`Category ${deleteModalCategory.name} deleted`);
      setDeleteModalCategory(null);
      loadCategories();
      changed();
    } catch (err) {
      setDeleteErrorMessage(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCategories = categories.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const activeCount = categories.filter((c) => c.is_active === 1).length;

  return (
    <div className="space-y-5">
      {canManage && (
        <Card className="p-4">
          <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row sm:items-start gap-3">
            <TextInput
              className="flex-1"
              icon={Tag}
              value={newCategoryName}
              onChange={(e) => { setNewCategoryName(e.target.value); setAddError(''); }}
              placeholder="New category, e.g. Beverages, Groceries, Services"
              aria-label="New category name"
              error={addError}
            />
            <Button type="submit" icon={Plus} loading={isAdding} disabled={!newCategoryName.trim()}>Add category</Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            <span className="font-bold text-ink">{categories.length}</span> categories ·{' '}
            <span className="font-semibold text-emerald-700">{activeCount} shown in billing</span>
          </p>
          <div className="flex items-center gap-2">
            <TextInput size="sm" icon={Search} className="w-56" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} placeholder="Find a category" aria-label="Find a category" />
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={loadCategories} aria-label="Refresh categories" />
          </div>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-ink-muted">Loading categories…</p>
        ) : filteredCategories.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={searchQuery ? 'No category matches' : 'No categories yet'}
            message={searchQuery ? 'Try a different name.' : 'Categories group your items on the billing screen.'}
          />
        ) : (
          <ul className="divide-y divide-line">
            {filteredCategories.map((cat) => {
              const isEditing = editingCategoryId === cat.id;
              const isActive = cat.is_active === 1;
              const itemCount = Number(cat.item_count) || 0;
              const activeItemCount = Number(cat.active_item_count) || 0;
              return (
                <li key={cat.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${isActive ? '' : 'bg-slate-50/60'}`}>
                  <CategoryArt name={cat.name} />

                  <div className="flex-1 min-w-[12rem]">
                    {isEditing ? (
                      <div className="flex items-start gap-2 max-w-md">
                        <TextInput
                          size="sm"
                          className="flex-1"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(cat.id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          error={editError}
                          aria-label={`New name for ${cat.name}`}
                          autoFocus
                        />
                        <Button size="sm" variant="success" icon={Check} onClick={() => handleSaveRename(cat.id)} aria-label="Save name" />
                        <Button size="sm" variant="ghost" icon={X} onClick={cancelEdit} aria-label="Cancel rename" />
                      </div>
                    ) : (
                      <>
                        <p className={`text-sm font-bold ${isActive ? 'text-ink' : 'text-ink-subtle'}`}>{cat.name}</p>
                        <p className="text-xs text-ink-muted">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'} · {activeItemCount} in billing
                        </p>
                      </>
                    )}
                  </div>

                  <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'In billing' : 'Hidden'}</Badge>

                  {canManage && !isEditing && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" icon={Edit2} onClick={() => startEditCategory(cat)}>Rename</Button>
                      <Button size="sm" variant="ghost" icon={isActive ? EyeOff : Eye} onClick={() => handleToggleStatus(cat)}>
                        {isActive ? 'Hide' : 'Show'}
                      </Button>
                      <Button size="sm" variant="danger-quiet" icon={Trash2}
                        onClick={() => { setDeleteErrorMessage(''); setDeleteModalCategory(cat); }}
                        aria-label={`Delete ${cat.name}`} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(deleteModalCategory)}
        onClose={() => setDeleteModalCategory(null)}
        title={deleteModalCategory ? `Delete ${deleteModalCategory.name}?` : ''}
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModalCategory(null)}>{deleteErrorMessage ? 'Close' : 'Cancel'}</Button>
            {deleteErrorMessage ? (
              <Button
                icon={EyeOff}
                onClick={() => { handleToggleStatus(deleteModalCategory); setDeleteModalCategory(null); }}
              >
                Hide it instead
              </Button>
            ) : (
              <Button variant="danger" loading={isDeleting} onClick={confirmDeleteCategory}>Delete category</Button>
            )}
          </>
        }
      >
        {deleteErrorMessage ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <p>{deleteErrorMessage}</p>
            <p className="mt-1 text-amber-800">You can hide the category from billing instead; its items and history stay intact.</p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">This can't be undone. Only empty categories can be deleted.</p>
        )}
      </Modal>
    </div>
  );
}
