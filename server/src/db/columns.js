// Money is stored as integer paise (*_paise) but the API speaks rupees.
// These SELECT fragments convert on the way out so every route returns the same shape.

const rupees = (expr, as) => `(${expr}) / 100.0 AS ${as}`;

function orderColumns(a = 'o') {
  return [
    `${a}.id`, `${a}.order_number`, `${a}.invoice_no`, `${a}.user_id`, `${a}.customer_id`,
    rupees(`${a}.subtotal_paise`, 'subtotal'),
    rupees(`${a}.discount_paise`, 'discount'),
    rupees(`${a}.final_amount_paise`, 'final_amount'),
    `${a}.payment_method`, `${a}.payment_status`,
    rupees(`${a}.cash_received_paise`, 'cash_received'),
    rupees(`${a}.change_given_paise`, 'change_given'),
    `${a}.notes`, `${a}.metadata`, `${a}.void_reason`, `${a}.created_at`, `${a}.updated_at`
  ].join(', ');
}

function itemColumns(a = 'i') {
  return [
    `${a}.id`, `${a}.category_id`, `${a}.name`,
    rupees(`${a}.price_paise`, 'price'),
    `${a}.image_url`, `${a}.is_active`, `${a}.created_at`, `${a}.updated_at`
  ].join(', ');
}

function orderItemColumns(a = 'oi') {
  return [
    `${a}.id`, `${a}.order_id`, `${a}.item_id`, `${a}.item_name`,
    rupees(`${a}.unit_price_paise`, 'unit_price'),
    `${a}.quantity`,
    rupees(`${a}.subtotal_paise`, 'subtotal')
  ].join(', ');
}

/** SUM of a paise column as rupees, e.g. sumRupees("CASE WHEN ... THEN final_amount_paise ELSE 0 END") */
const sumRupees = (expr) => `COALESCE(SUM(${expr}), 0) / 100.0`;

module.exports = { orderColumns, itemColumns, orderItemColumns, sumRupees };
