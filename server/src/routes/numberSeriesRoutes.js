const express = require('express');
const { transaction } = require('../db/database');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { logAuditSync } = require('../services/auditService');
const series = require('../services/numberSeriesService');

const router = express.Router();

router.use(authenticateToken);
router.use(requirePermission('settings.manage'));

function findSeries(req, res) {
  const code = String(req.params.code || '').toUpperCase();
  const current = series.getSeries(code);
  if (!current) {
    res.status(404).json({ error: `Unknown number series ${code}` });
    return null;
  }
  return { code, current };
}

function sendError(res, err) {
  if (err instanceof series.SeriesError) return res.status(err.status).json({ error: err.message, fields: err.fields });
  throw err;
}

// GET /api/number-series - all series with the next number each would produce today
router.get('/', (req, res) => {
  res.json({ series: series.listSeries(), options: series.OPTIONS });
});

// POST /api/number-series/:code/preview - what the next number would look like with these changes (nothing saved)
router.post('/:code/preview', (req, res) => {
  const found = findSeries(req, res);
  if (!found) return;
  try {
    const result = series.validateSeriesPatch(found.code, req.body, found.current);
    const next = { ...found.current, ...result.changes };
    const preview = result.nextNumber
      ? series.formatNumber(next, result.nextNumber, series.periodFor(next.reset_policy).token)
      : series.peekWith(found.code, next).value;
    return res.json({ preview });
  } catch (err) {
    return sendError(res, err);
  }
});

// PUT /api/number-series/:code - change format / reset rule, or move the next number forward (audited)
router.put('/:code', (req, res) => {
  const found = findSeries(req, res);
  if (!found) return;
  try {
    const before = series.describe(found.code);
    const result = series.validateSeriesPatch(found.code, req.body, found.current);
    transaction(() => {
      series.applySeriesUpdate(found.code, result);
      const after = series.describe(found.code);
      logAuditSync({
        userId: req.user.id,
        userName: req.user.username,
        action: 'NUMBER_SERIES_UPDATE',
        entityType: 'number_series',
        entityId: 0,
        oldValue: { code: found.code, ...pick(before) },
        newValue: { code: found.code, ...pick(after) }
      });
    });
    return res.json({ series: series.describe(found.code) });
  } catch (err) {
    return sendError(res, err);
  }
});

const pick = (s) => ({
  prefix: s.prefix, separator: s.separator, include_period: s.include_period, padding: s.padding,
  suffix: s.suffix, reset_policy: s.reset_policy, start_number: s.start_number, next_value: s.next_value
});

module.exports = router;
