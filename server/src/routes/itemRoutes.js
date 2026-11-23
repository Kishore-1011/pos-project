const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { all, get, run } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { getUploadsDirectory } = require('../config/paths');

const router = express.Router();

// Multer Storage Configuration for Local Item Images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = getUploadsDirectory();
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `item-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.use(authenticateToken);

// GET /api/items - Available to both CASHIER and ADMIN
router.get('/', async (req, res) => {
  try {
    const { activeOnly } = req.query;
    let sql = `
      SELECT i.id, i.name, i.price, i.image_url, i.category_id, i.is_active, c.name as category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
    `;
    const params = [];
    if (activeOnly === 'true') {
      sql += ' WHERE i.is_active = 1 AND (c.is_active = 1 OR i.category_id IS NULL)';
    }
    sql += ' ORDER BY i.name ASC';

    const items = await all(sql, params);
    const categories = activeOnly === 'true'
      ? await all("SELECT id, name, is_active FROM categories WHERE is_active = 1 ORDER BY name ASC")
      : await all("SELECT id, name, is_active FROM categories ORDER BY name ASC");

    return res.json({ items, categories });
  } catch (err) {
    console.error('Fetch Items Error:', err);
    return res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST /api/items - Admin Only (Supports Multer file upload 'image')
router.post('/', requireRole('ADMIN'), upload.single('image'), async (req, res) => {
  try {
    const { name, price, category_id, image_url } = req.body;

    if (!name || price === undefined || price < 0) {
      return res.status(400).json({ error: 'Valid item name and non-negative price are required' });
    }

    let finalImgUrl = image_url ? image_url.trim() : null;
    if (req.file) {
      finalImgUrl = `/uploads/items/${req.file.filename}`;
    }

    const result = await run(
      `INSERT INTO items (name, price, category_id, image_url, is_active) VALUES (?, ?, ?, ?, 1)`,
      [name.trim(), parseFloat(price), category_id ? parseInt(category_id, 10) : null, finalImgUrl]
    );

    const newItem = await get("SELECT * FROM items WHERE id = ?", [result.lastInsertRowid]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'ITEM_CREATE',
      entityType: 'item',
      entityId: newItem.id,
      newValue: { name: newItem.name, price: newItem.price, category_id: newItem.category_id, image_url: newItem.image_url }
    });

    return res.status(201).json(newItem);
  } catch (err) {
    console.error('Create Item Error:', err);
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/items/:id - Admin Only (Supports Multer file upload 'image')
router.put('/:id', requireRole('ADMIN'), upload.single('image'), async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    const { name, price, category_id, image_url } = req.body;

    const oldItem = await get("SELECT * FROM items WHERE id = ?", [itemId]);
    if (!oldItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const newPrice = price !== undefined ? parseFloat(price) : oldItem.price;
    const newName = name ? name.trim() : oldItem.name;
    const newCatId = category_id !== undefined ? (category_id ? parseInt(category_id, 10) : null) : oldItem.category_id;
    
    let newImgUrl = oldItem.image_url;
    if (req.file) {
      newImgUrl = `/uploads/items/${req.file.filename}`;
    } else if (image_url !== undefined) {
      newImgUrl = image_url ? image_url.trim() : null;
    }

    await run(
      `UPDATE items SET name = ?, price = ?, category_id = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newName, newPrice, newCatId, newImgUrl, itemId]
    );

    const updatedItem = await get("SELECT * FROM items WHERE id = ?", [itemId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'PRICE_UPDATE',
      entityType: 'item',
      entityId: itemId,
      oldValue: { name: oldItem.name, price: oldItem.price, category_id: oldItem.category_id, image_url: oldItem.image_url },
      newValue: { name: updatedItem.name, price: updatedItem.price, category_id: updatedItem.category_id, image_url: updatedItem.image_url }
    });

    return res.json(updatedItem);
  } catch (err) {
    console.error('Update Item Error:', err);
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

// PATCH /api/items/:id/status - Admin Only
router.patch('/:id/status', requireRole('ADMIN'), async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const oldItem = await get("SELECT * FROM items WHERE id = ?", [itemId]);
    if (!oldItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await run(
      `UPDATE items SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [is_active ? 1 : 0, itemId]
    );

    const updatedItem = await get("SELECT * FROM items WHERE id = ?", [itemId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'ITEM_TOGGLE',
      entityType: 'item',
      entityId: itemId,
      oldValue: { is_active: oldItem.is_active },
      newValue: { is_active: updatedItem.is_active }
    });

    return res.json(updatedItem);
  } catch (err) {
    console.error('Toggle Item Status Error:', err);
    return res.status(500).json({ error: 'Failed to update item status' });
  }
});

// PATCH /api/items/bulk - Admin Bulk Update Items (Status, Category, Price)
router.patch('/bulk', requireRole('ADMIN'), async (req, res) => {
  try {
    const { item_ids, action, value } = req.body;

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'item_ids array is required' });
    }

    if (!['STATUS', 'CATEGORY', 'PRICE'].includes(action)) {
      return res.status(400).json({ error: 'Invalid bulk action. Allowed: STATUS, CATEGORY, PRICE' });
    }

    const ids = item_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid item IDs provided' });
    }

    const updatedItems = [];

    for (const id of ids) {
      const oldItem = await get("SELECT * FROM items WHERE id = ?", [id]);
      if (!oldItem) continue;

      let newPrice = oldItem.price;
      let newCatId = oldItem.category_id;
      let newActive = oldItem.is_active;
      let auditAction = 'BULK_UPDATE';

      if (action === 'STATUS') {
        newActive = value.is_active ? 1 : 0;
        auditAction = 'ITEM_TOGGLE_BULK';
        await run("UPDATE items SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newActive, id]);
      } else if (action === 'CATEGORY') {
        newCatId = value.category_id ? parseInt(value.category_id, 10) : null;
        auditAction = 'ITEM_CATEGORY_BULK';
        await run("UPDATE items SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newCatId, id]);
      } else if (action === 'PRICE') {
        const { mode, amount, percentage, price } = value;
        if (mode === 'FIXED') {
          newPrice = Math.max(0, parseFloat(price) || 0);
        } else if (mode === 'PERCENT_INC') {
          newPrice = Math.max(0, oldItem.price * (1 + (parseFloat(percentage) || 0) / 100));
        } else if (mode === 'PERCENT_DEC') {
          newPrice = Math.max(0, oldItem.price * (1 - (parseFloat(percentage) || 0) / 100));
        } else if (mode === 'FLAT_INC') {
          newPrice = Math.max(0, oldItem.price + (parseFloat(amount) || 0));
        } else if (mode === 'FLAT_DEC') {
          newPrice = Math.max(0, oldItem.price - (parseFloat(amount) || 0));
        }
        newPrice = Math.round(newPrice * 100) / 100;
        auditAction = 'ITEM_PRICE_BULK';
        await run("UPDATE items SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newPrice, id]);
      }

      const updated = await get("SELECT * FROM items WHERE id = ?", [id]);
      updatedItems.push(updated);

      await logAudit({
        userId: req.user.id,
        userName: req.user.username,
        action: auditAction,
        entityType: 'item',
        entityId: id,
        oldValue: { name: oldItem.name, price: oldItem.price, category_id: oldItem.category_id, is_active: oldItem.is_active },
        newValue: { name: updated.name, price: updated.price, category_id: updated.category_id, is_active: updated.is_active }
      });
    }

    return res.json({
      message: `Successfully updated ${updatedItems.length} items`,
      items: updatedItems
    });
  } catch (err) {
    console.error('Bulk Update Items Error:', err);
    return res.status(500).json({ error: 'Failed to bulk update items' });
  }
});

module.exports = router;
