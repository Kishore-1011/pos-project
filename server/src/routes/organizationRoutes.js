const express = require('express');
const { transaction } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAuditSync } = require('../services/auditService');
const { createImageUpload, removeUploadedFile } = require('../services/imageUpload');
const org = require('../services/organizationService');

const router = express.Router();
const logoUpload = createImageUpload({ folder: 'branding', prefix: 'logo', maxBytes: 2 * 1024 * 1024 });

const { today: todayInShopZone } = require('../services/calendar');

function snapshot() {
  const organization = org.getOrganization();
  const licences = org.getLicences();
  return {
    organization,
    licences,
    warnings: org.complianceWarnings(organization, licences, todayInShopZone()),
    options: org.OPTIONS
  };
}

function sendValidation(res, err) {
  if (err instanceof org.ValidationError) {
    return res.status(400).json({ error: err.message, fields: err.fields });
  }
  throw err;
}

router.use(authenticateToken);

// GET /api/organization - all staff (bills and the app header need the shop details)
router.get('/', (req, res) => {
  res.json(snapshot());
});

// PUT /api/organization - partial update of profile & tax fields (admin)
router.put('/', requireRole('ADMIN'), (req, res) => {
  try {
    const before = org.getOrganization();
    const changes = org.validateOrganizationPatch(req.body, before);
    const changedKeys = Object.keys(changes).filter(
      (k) => JSON.stringify(changes[k]) !== JSON.stringify(before[k])
    );
    if (changedKeys.length) {
      transaction(() => {
        org.updateOrganization(Object.fromEntries(changedKeys.map((k) => [k, changes[k]])));
        logAuditSync({
          userId: req.user.id,
          userName: req.user.username,
          action: 'ORGANIZATION_UPDATE',
          entityType: 'organization',
          entityId: 1,
          oldValue: Object.fromEntries(changedKeys.map((k) => [k, before[k]])),
          newValue: Object.fromEntries(changedKeys.map((k) => [k, changes[k]]))
        });
      });
    }
    return res.json(snapshot());
  } catch (err) {
    return sendValidation(res, err);
  }
});

// PUT /api/organization/licences - replace the whole licence list (admin)
router.put('/licences', requireRole('ADMIN'), (req, res) => {
  try {
    const rows = org.validateLicences(req.body && req.body.licences);
    const before = org.getLicences();
    transaction(() => {
      org.replaceLicences(rows);
      logAuditSync({
        userId: req.user.id,
        userName: req.user.username,
        action: 'LICENCES_UPDATE',
        entityType: 'organization',
        entityId: 1,
        oldValue: before.map(({ type, number, valid_until, print_on_bill }) => ({ type, number, valid_until, print_on_bill })),
        newValue: rows.map(({ type, number, valid_until, print_on_bill }) => ({ type, number, valid_until, print_on_bill }))
      });
    });
    return res.json(snapshot());
  } catch (err) {
    return sendValidation(res, err);
  }
});

// POST /api/organization/logo - upload the shop logo, field "logo" (admin)
router.post('/logo', requireRole('ADMIN'), logoUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image file to upload' });
  const before = org.getOrganization().logo_url;
  const logoUrl = `/uploads/branding/${req.file.filename}`;
  transaction(() => {
    org.updateOrganization({ logo_url: logoUrl });
    logAuditSync({
      userId: req.user.id, userName: req.user.username, action: 'LOGO_UPDATE',
      entityType: 'organization', entityId: 1, oldValue: { logo_url: before }, newValue: { logo_url: logoUrl }
    });
  });
  removeUploadedFile(before, 'branding');
  return res.json(snapshot());
});

// DELETE /api/organization/logo (admin)
router.delete('/logo', requireRole('ADMIN'), (req, res) => {
  const before = org.getOrganization().logo_url;
  if (before) {
    transaction(() => {
      org.updateOrganization({ logo_url: null });
      logAuditSync({
        userId: req.user.id, userName: req.user.username, action: 'LOGO_REMOVE',
        entityType: 'organization', entityId: 1, oldValue: { logo_url: before }, newValue: { logo_url: null }
      });
    });
    removeUploadedFile(before, 'branding');
  }
  return res.json(snapshot());
});

module.exports = router;
