const express = require('express');
const { all, get, run } = require('../db/database');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

const router = express.Router();

router.use(authenticateToken);

// GET /api/categories - Available to CASHIER and ADMIN
router.get('/', async (req, res) => {
  try {
    const { activeOnly } = req.query;

    let sql = `
      SELECT 
        c.id, 
        c.name, 
        c.is_active, 
        c.created_at,
        COUNT(i.id) as item_count,
        COUNT(CASE WHEN i.is_active = 1 THEN 1 END) as active_item_count
      FROM categories c
      LEFT JOIN items i ON c.id = i.category_id
    `;

    const params = [];
    if (activeOnly === 'true') {
      sql += ` WHERE c.is_active = 1`;
    }

    sql += ` GROUP BY c.id ORDER BY c.name ASC`;

    const categories = await all(sql, params);
    return res.json({ categories });
  } catch (err) {
    console.error('Fetch Categories Error:', err);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories - Admin Only
router.post('/', requirePermission('items.manage'), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const cleanName = name.trim();

    // Check duplicate
    const existing = await get("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)", [cleanName]);
    if (existing) {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }

    const result = await run(
      `INSERT INTO categories (name, is_active, created_at) VALUES (?, 1, CURRENT_TIMESTAMP)`,
      [cleanName]
    );

    const newCategory = await get("SELECT * FROM categories WHERE id = ?", [result.lastInsertRowid]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CATEGORY_CREATE',
      entityType: 'category',
      entityId: newCategory.id,
      newValue: { name: newCategory.name, is_active: newCategory.is_active }
    });

    return res.status(201).json({ category: newCategory });
  } catch (err) {
    console.error('Create Category Error:', err);
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Admin Only (Rename)
router.put('/:id', requirePermission('items.manage'), async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const cleanName = name.trim();

    const oldCategory = await get("SELECT * FROM categories WHERE id = ?", [categoryId]);
    if (!oldCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check duplicate among other categories
    const duplicate = await get("SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?", [cleanName, categoryId]);
    if (duplicate) {
      return res.status(400).json({ error: 'Another category with this name already exists' });
    }

    await run(
      `UPDATE categories SET name = ? WHERE id = ?`,
      [cleanName, categoryId]
    );

    const updatedCategory = await get("SELECT * FROM categories WHERE id = ?", [categoryId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CATEGORY_RENAME',
      entityType: 'category',
      entityId: categoryId,
      oldValue: { name: oldCategory.name },
      newValue: { name: updatedCategory.name }
    });

    return res.json({ category: updatedCategory });
  } catch (err) {
    console.error('Update Category Error:', err);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

// PATCH /api/categories/:id/status - Admin Only (Toggle Active/Deactivate)
router.patch('/:id/status', requirePermission('items.manage'), async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const oldCategory = await get("SELECT * FROM categories WHERE id = ?", [categoryId]);
    if (!oldCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const newActiveState = (is_active === 1 || is_active === true) ? 1 : 0;

    await run(
      `UPDATE categories SET is_active = ? WHERE id = ?`,
      [newActiveState, categoryId]
    );

    const updatedCategory = await get("SELECT * FROM categories WHERE id = ?", [categoryId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CATEGORY_TOGGLE',
      entityType: 'category',
      entityId: categoryId,
      oldValue: { is_active: oldCategory.is_active },
      newValue: { is_active: updatedCategory.is_active }
    });

    return res.json({ category: updatedCategory });
  } catch (err) {
    console.error('Toggle Category Status Error:', err);
    return res.status(500).json({ error: 'Failed to toggle category status' });
  }
});

// DELETE /api/categories/:id - Admin Only (Checks for assigned items)
router.delete('/:id', requirePermission('items.manage'), async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);

    const category = await get("SELECT * FROM categories WHERE id = ?", [categoryId]);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if any items are assigned
    const countRow = await get("SELECT COUNT(*) as count FROM items WHERE category_id = ?", [categoryId]);
    const itemCount = countRow ? countRow.count : 0;

    if (itemCount > 0) {
      return res.status(400).json({
        error: `Cannot delete category "${category.name}" because ${itemCount} item${itemCount > 1 ? 's are' : ' is'} currently assigned to it. Please reassign items or deactivate the category instead.`
      });
    }

    await run("DELETE FROM categories WHERE id = ?", [categoryId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CATEGORY_DELETE',
      entityType: 'category',
      entityId: categoryId,
      oldValue: { name: category.name }
    });

    return res.json({ success: true, message: `Category "${category.name}" deleted successfully` });
  } catch (err) {
    console.error('Delete Category Error:', err);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
