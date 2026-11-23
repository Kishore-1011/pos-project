import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ThermalReceipt } from '../components/ThermalReceipt';
import * as billingMath from '../utils/billing';
import { formatInvoiceFallback } from '../config/brand';
import { formatMoney } from '../utils/format';
import { Badge, Button, TextInput, MoneyInput, EmptyState, useToast } from '../components/ui';
import {
  Plus, Minus, Trash2, Printer, CheckCircle2, X, AlertCircle, Save, RotateCcw, CreditCard, Banknote, Users, Phone, UserCheck, Check, Smartphone, ShoppingCart, Search
} from 'lucide-react';

export function BillingView({ searchQuery, setSearchQuery, searchInputRef }) {
  const { user, authFetch } = useAuth();
  const toast = useToast();

  // Inline customer lookup in the cart header (replaces the pop-up on the first item)
  const [inlinePhone, setInlinePhone] = useState('');
  const [inlineSuggestions, setInlineSuggestions] = useState([]);
  const [isSearchingInline, setIsSearchingInline] = useState(false);

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);

  // Customer CRM State
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { id, customer_code, name, phone } | null
  const [, setIsGuestOrder] = useState(false); // kept for the registration dialog's walk-in path
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [pendingItemToAdd, setPendingItemToAdd] = useState(null);

  // Customer Modal Form & Live Autocomplete State
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [selectedExistingCustomer, setSelectedExistingCustomer] = useState(null);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [customerFormError, setCustomerFormError] = useState('');
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);

  // Discount State (Flat ₹ or Percent %)
  const [discountType, setDiscountType] = useState('FLAT'); // 'FLAT' | 'PERCENT'
  const [discountValue, setDiscountValue] = useState(0);

  const [loading, setLoading] = useState(true);

  // Payment State: 'CASH' | 'UPI' | 'CARD'
  const [paymentMode, setPaymentMode] = useState('CASH');
  const isDigitalPayment = paymentMode !== 'CASH';
  const [cashReceived, setCashReceived] = useState('');
  const [cashEdited, setCashEdited] = useState(false); // true once the cashier types/adjusts the amount
  const [notes, setNotes] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Saved Order State for 3-Button Action Workflow
  const [savedOrder, setSavedOrder] = useState(null);

  // Success Toast State
  const [showSaveToast, setShowSaveToast] = useState(null);

  // New Order Unsaved Guard Modal State
  const [showNewOrderGuard, setShowNewOrderGuard] = useState(false);

  // Thermal Receipt Modal State
  const [rollSize, setRollSize] = useState('58mm');
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Auto-dismiss (strictly 1s / 1000ms) and click-away listener for Success Toast
  useEffect(() => {
    if (!showSaveToast) return;
    const timer = setTimeout(() => {
      setShowSaveToast(null);
    }, 1000);

    const handleWindowClick = () => {
      setShowSaveToast(null);
    };

    // Small delay to prevent immediate trigger on the save button click
    const clickTimer = setTimeout(() => {
      window.addEventListener('click', handleWindowClick, { once: true });
    }, 100);

    return () => {
      clearTimeout(timer);
      clearTimeout(clickTimer);
      window.removeEventListener('click', handleWindowClick);
    };
  }, [showSaveToast]);

  // Keyboard shortcut listener for '/' search focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef?.current) {
        e.preventDefault();
        searchInputRef?.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchInputRef]);

  // Load Menu Items
  const fetchMenu = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/items?activeOnly=true');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to load menu:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes((searchQuery || '').toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || item.category_id === parseInt(selectedCategory, 10);
      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, selectedCategory]);

  // Live Autocomplete Effect for Customer Phone / Name
  useEffect(() => {
    if (!showCustomerModal) return;
    const trimmed = customerPhoneInput.trim();
    if (!trimmed || (selectedExistingCustomer && selectedExistingCustomer.phone === trimmed)) {
      setCustomerSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingCustomers(true);
        const res = await authFetch(`/api/customers?search=${encodeURIComponent(trimmed)}&limit=6&withStats=false`);
        if (res.ok) {
          const data = await res.json();
          setCustomerSuggestions(data.customers || []);
        }
      } catch (err) {
        console.error('Customer autocomplete search error:', err);
      } finally {
        setIsSearchingCustomers(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [customerPhoneInput, showCustomerModal, selectedExistingCustomer]);

  // Cart Management (Defensive checks)
  const actuallyAddItemToCart = (item) => {
    if (!item) return;
    const safeItem = {
      id: item.id,
      name: item.name || 'Unnamed Item',
      price: Number(item.price) || 0,
      image_url: item.image_url || '',
      category_name: item.category_name || 'General'
    };

    setCart(prevCart => {
      const existing = prevCart.find(c => c.id === safeItem.id);
      if (existing) {
        return prevCart.map(c => c.id === safeItem.id ? { ...c, quantity: (Number(c.quantity) || 1) + 1 } : c);
      }
      return [...prevCart, { ...safeItem, quantity: 1 }];
    });
  };

  // Items go straight into the cart. The customer is optional and attached from the cart header
  // (walk-in by default), instead of a pop-up blocking the first item of every bill (UI review C3).
  const addToCart = (item) => {
    if (!item || savedOrder) return; // Cart locked once order is saved until New bill
    actuallyAddItemToCart(item);
  };

  // Look up customers as the cashier types a phone number in the cart header
  useEffect(() => {
    const term = inlinePhone.trim();
    if (selectedCustomer || term.length < 3) {
      setInlineSuggestions([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        setIsSearchingInline(true);
        const res = await authFetch(`/api/customers?search=${encodeURIComponent(term)}&limit=5&withStats=false`);
        if (res.ok) setInlineSuggestions((await res.json()).customers || []);
      } catch (err) {
        console.error('Customer lookup failed:', err);
      } finally {
        setIsSearchingInline(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [inlinePhone, selectedCustomer]);

  const handlePickCustomer = (cust) => {
    setSelectedCustomer(cust);
    setIsGuestOrder(false);
    setInlinePhone('');
    setInlineSuggestions([]);
  };

  const handleRemoveCustomer = () => {
    if (savedOrder) return;
    setSelectedCustomer(null);
    setIsGuestOrder(true);
  };

  // New customer: reuse the registration dialog, with the typed number filled in
  const handleRegisterNewCustomer = () => {
    setSelectedExistingCustomer(null);
    setCustomerPhoneInput(inlinePhone.trim());
    setCustomerNameInput('');
    setCustomerSuggestions([]);
    setCustomerFormError('');
    setPendingItemToAdd(null);
    setInlinePhone('');
    setInlineSuggestions([]);
    setShowCustomerModal(true);
  };

  const handleSelectCustomerSuggestion = (cust) => {
    setSelectedExistingCustomer(cust);
    setCustomerPhoneInput(cust.phone);
    setCustomerNameInput(cust.name);
    setCustomerSuggestions([]);
    setCustomerFormError('');
  };

  const handleConfirmCustomer = async (e) => {
    if (e) e.preventDefault();
    setCustomerFormError('');

    // If existing customer chosen from autocomplete
    if (selectedExistingCustomer) {
      setSelectedCustomer(selectedExistingCustomer);
      setIsGuestOrder(false);
      setShowCustomerModal(false);
      if (pendingItemToAdd) {
        actuallyAddItemToCart(pendingItemToAdd);
        setPendingItemToAdd(null);
      }
      return;
    }

    const cleanPhone = customerPhoneInput.trim();
    const cleanName = customerNameInput.trim();

    if (!cleanPhone) {
      setCustomerFormError('Please enter a phone number or click [ Skip / Walk-in ]');
      return;
    }

    if (!cleanName) {
      setCustomerFormError('Please enter customer name');
      return;
    }

    try {
      setIsSubmittingCustomer(true);
      const res = await authFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name: cleanName, phone: cleanPhone })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save customer');
      }

      const cust = data.customer;
      setSelectedCustomer(cust);
      setIsGuestOrder(false);
      setShowCustomerModal(false);

      if (pendingItemToAdd) {
        actuallyAddItemToCart(pendingItemToAdd);
        setPendingItemToAdd(null);
      }
    } catch (err) {
      setCustomerFormError(err.message);
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleSkipWalkIn = () => {
    setSelectedCustomer(null);
    setIsGuestOrder(true);
    setShowCustomerModal(false);
    setCustomerFormError('');
    if (pendingItemToAdd) {
      actuallyAddItemToCart(pendingItemToAdd);
      setPendingItemToAdd(null);
    }
  };


  const updateQuantity = (itemId, delta) => {
    if (savedOrder) return;
    setCart(prevCart => {
      return prevCart
        .map(c => {
          if (c.id === itemId) {
            const currentQty = Number(c.quantity) || 1;
            const newQty = currentQty + delta;
            return newQty > 0 ? { ...c, quantity: newQty } : null;
          }
          return c;
        })
        .filter(Boolean);
    });
  };

  // Reset function to clear cart and inputs
  const resetOrderState = () => {
    setCart([]);
    setSelectedCustomer(null);
    setIsGuestOrder(false);
    setPendingItemToAdd(null);
    setSelectedExistingCustomer(null);
    setDiscountValue(0);
    setCashReceived('');
    setCashEdited(false);
    setInlinePhone('');
    setInlineSuggestions([]);
    setNotes('');
    setSavedOrder(null);
    setShowReceiptModal(false);
    setShowNewOrderGuard(false);
    setShowSaveToast(null);
    if (searchInputRef?.current) {
      searchInputRef.current.focus();
    }
  };

  // Triggered by [ New Order ] or Clear Cart with Unsaved Guard
  const handleNewOrderClick = () => {
    if (cart.length > 0 && !savedOrder) {
      setShowNewOrderGuard(true);
      return;
    }
    resetOrderState();
  };

  // Billing maths lives in utils/billing.js (paise-exact, unit-tested)
  const subtotal = useMemo(() => billingMath.cartSubtotal(cart), [cart]);
  const totalItemCount = useMemo(() => billingMath.cartItemCount(cart), [cart]);
  const computedDiscount = useMemo(
    () => billingMath.discountAmount(subtotal, discountType, discountValue),
    [subtotal, discountValue, discountType]
  );
  const grandTotal = billingMath.grandTotal(subtotal, computedDiscount);

  // Cash received follows the bill total (rounded UP so it always covers it) until the cashier types an
  // amount or uses a quick-cash button. Previously it filled once ("0" on an empty cart, or the first
  // item's price) and then stopped, so every cash bill showed "Short by" until corrected by hand.
  useEffect(() => {
    if (paymentMode === 'CASH' && !cashEdited) {
      setCashReceived(grandTotal > 0 ? String(billingMath.suggestedCash(grandTotal)) : '');
    }
  }, [grandTotal, paymentMode, cashEdited]);

  // Cash Tender Math & Validation Rules
  const cashReceivedVal = parseFloat(cashReceived) || 0;
  const changeToReturn = paymentMode === 'CASH' ? billingMath.cashChange(cashReceivedVal, grandTotal) : 0;
  const isCashSufficient = paymentMode === 'CASH' ? billingMath.isCashEnough(cashReceivedVal, grandTotal) : true;
  const canSaveOrder = cart.length > 0 && !savedOrder && !isSubmittingOrder && (isDigitalPayment || isCashSufficient);

  // Quick denomination adders
  const addTenderAmount = (extra) => {
    if (isDigitalPayment || savedOrder) return;
    setCashEdited(true);
    setCashReceived((prev) => {
      const current = parseFloat(prev) || 0;
      return String((current + extra).toFixed(0));
    });
  };

  const setExactTender = () => {
    if (isDigitalPayment || savedOrder) return;
    setCashReceived(String(billingMath.suggestedCash(grandTotal)));
  };

  // ACTION 1: Save / Paid (Non-Destructive: Saves to DB, shows toast, enables print, preserves cart items)
  const handleSaveOrder = async () => {
    if (cart.length === 0 || savedOrder || isSubmittingOrder) return;

    if (paymentMode === 'CASH' && !isCashSufficient) {
      toast.error(`Cash received (${formatMoney(cashReceivedVal)}) is less than the total (${formatMoney(grandTotal)}).`);
      return;
    }

    // 1. Deep-copy / freeze exact active cart snapshot for this transaction
    const cartSnapshot = cart.map(c => {
      const priceNum = Number(c.price || c.unit_price) || 0;
      const qtyNum = Number(c.quantity || c.qty) || 1;
      return {
        id: c.id,
        item_id: c.id,
        name: c.name || c.item_name || 'Unnamed Item',
        item_name: c.name || c.item_name || 'Unnamed Item',
        price: priceNum,
        unit_price: priceNum,
        quantity: qtyNum,
        qty: qtyNum,
        subtotal: priceNum * qtyNum
      };
    });

    try {
      setIsSubmittingOrder(true);
      const actualPaymentMethod = paymentMode;

      const payload = {
        items: cartSnapshot.map(c => ({ item_id: c.item_id, quantity: c.quantity })),
        discount: computedDiscount,
        payment_method: actualPaymentMethod,
        cash_received: paymentMode === 'CASH' ? cashReceivedVal : grandTotal,
        notes: notes,
        metadata: { mode: `${actualPaymentMethod}_POS`, status: 'PAID' },
        customer_id: selectedCustomer ? selectedCustomer.id : null
      };

      const res = await authFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save order');
      }

      const resultData = await res.json().catch(() => ({}));
      
      // Robust normalized order header
      const rawOrder = resultData?.order || resultData?.data?.order || resultData?.data || resultData || {};
      const orderNumber = (
        rawOrder?.invoice_no ||
        rawOrder?.order_number ||
        resultData?.invoice_no ||
        resultData?.order_number ||
        formatInvoiceFallback(rawOrder?.id)
      );

      const staffName = user?.full_name || user?.username || rawOrder?.cashier_name || rawOrder?.cashier_username || 'Staff';

      // 2. Strict Snapshot Isolation: Always use the exact cart snapshot of this transaction
      const safeSavedOrder = {
        order: {
          ...rawOrder,
          id: rawOrder?.id,
          order_number: orderNumber,
          invoice_no: orderNumber,
          customer_id: selectedCustomer ? selectedCustomer.id : rawOrder?.customer_id || null,
          customer_name: selectedCustomer ? selectedCustomer.name : rawOrder?.customer_name || null,
          customer_phone: selectedCustomer ? selectedCustomer.phone : rawOrder?.customer_phone || null,
          customer_code: selectedCustomer ? selectedCustomer.customer_code : rawOrder?.customer_code || null,
          cashier_name: staffName,
          cashier_username: user?.username || 'Staff',
          subtotal: rawOrder?.subtotal ?? subtotal,
          discount: rawOrder?.discount ?? computedDiscount,
          final_amount: rawOrder?.final_amount ?? grandTotal,
          grand_total: rawOrder?.final_amount ?? grandTotal,
          payment_method: rawOrder?.payment_method || actualPaymentMethod,
          cash_received: rawOrder?.cash_received ?? (paymentMode === 'CASH' ? cashReceivedVal : grandTotal),
          tendered_amount: rawOrder?.cash_received ?? (paymentMode === 'CASH' ? cashReceivedVal : grandTotal),
          change_given: rawOrder?.change_given ?? changeToReturn,
          change_returned: rawOrder?.change_given ?? changeToReturn,
          created_at: rawOrder?.created_at || new Date().toISOString()
        },
        items: cartSnapshot,
        order_number: orderNumber,
        invoice_no: orderNumber
      };

      setSavedOrder(safeSavedOrder);
      setShowSaveToast({
        orderNumber: orderNumber,
        total: grandTotal
      });
    } catch (err) {
      toast.error(err.message, { title: 'Bill not saved' });
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // ACTION 2: Print Receipt (Opens preview modal without premature window.print())
  const handlePrintReceipt = () => {
    if (!savedOrder) return;
    setShowReceiptModal(true);
  };

  // Helper to format Image URL for local server or external URLs
  const formatImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    return url.startsWith('/') ? url : `/${url}`;
  };

  return (
    <div className="w-full h-full max-w-7xl mx-auto flex flex-col min-h-0 overflow-hidden">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch h-full min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Categories & Menu Catalog Grid (7-8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 h-full flex flex-col min-h-0 overflow-hidden space-y-3">
          
          {/* Category Filter Pills (Pinned Top) */}
          <div className="flex-shrink-0">
            {/* Item search lives on the Billing screen (it used to sit in the top bar of every screen) */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery && setSearchQuery(''); }}
                placeholder="Search items"
                aria-label="Search items"
                className="w-full h-10 bg-surface border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 rounded-xl pl-9 pr-10 text-sm text-ink placeholder:text-ink-subtle outline-none"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono font-bold text-ink-subtle bg-slate-100 px-1.5 py-0.5 rounded border border-line" aria-hidden="true">/</kbd>
            </div>

            {/* Category filter: one row of chips (used to be two rows of large cards) */}
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by category">
              {[{ id: 'ALL', name: 'All', count: items.length },
                ...categories.map((cat) => ({ id: String(cat.id), name: cat.name, count: items.filter((i) => i.category_id === cat.id).length }))
              ].map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`h-8 px-3 rounded-full border text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-surface border-line text-ink-muted hover:border-brand-500 hover:text-ink'
                    }`}
                  >
                    {cat.name}
                    <span className={`text-xs tabular-nums ${isSelected ? 'text-white/80' : 'text-ink-subtle'}`}>{cat.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu Catalog Grid */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h2 className="text-sm font-bold text-ink tracking-tight">
                Items
              </h2>
              <span className="text-xs text-ink-muted font-semibold">{filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}</span>
            </div>

            {loading ? (
              <div className="text-center py-16 text-slate-400 text-sm">Loading items...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm">
                No items match your search.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 content-start auto-rows-max scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400">
                {filteredItems.map((item) => {
                  const inCartItem = cart.find(c => c.id === item.id);
                  const imgPath = formatImageUrl(item.image_url);

                  // Compact card (UI review H1): photo strip only when the item has a photo; no repeated
                  // name in a grey placeholder, no "READY" tag. More items fit on a laptop screen.
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => addToCart(item)}
                      disabled={!!savedOrder}
                      aria-label={`${item.name}, ${formatMoney(item.price)}${inCartItem ? `, ${inCartItem.quantity} in bill` : ''}`}
                      className={`group relative rounded-xl border overflow-hidden transition-colors flex flex-col bg-surface text-left h-fit ${
                        savedOrder ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-brand-500 hover:shadow-sm'
                      } ${inCartItem ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line'}`}
                    >
                      {imgPath && (
                        <div className="w-full h-20 bg-slate-100 overflow-hidden">
                          <img
                            src={imgPath}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                          />
                        </div>
                      )}

                      {inCartItem && (
                        <span className="absolute top-1.5 right-1.5 min-w-6 h-6 px-1.5 rounded-full bg-brand-600 text-white text-xs font-bold tabular-nums flex items-center justify-center shadow-sm" aria-hidden="true">
                          {inCartItem.quantity}
                        </span>
                      )}

                      <div className="p-3 flex flex-col gap-1 w-full">
                        <span className={`text-sm font-semibold text-ink leading-snug line-clamp-2 ${inCartItem ? 'pr-7' : ''} group-hover:text-brand-700`}>
                          {item.name}
                        </span>
                        <span className="text-xs text-ink-subtle truncate">{item.category_name || 'Uncategorised'}</span>
                        <span className="text-sm font-bold text-brand-700 tabular-nums">{formatMoney(item.price)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: the current bill. Header, customer and pay panel stay in place and only the
            cart lines scroll, so Save / Print / New bill are always visible on a 1366x768 laptop
            (UI review C1). */}
        <div className="lg:col-span-5 xl:col-span-4 h-full min-h-0">
          <section aria-label="Current bill" className="flex flex-col h-full bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">

            {/* 1. Title row */}
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 pt-3 pb-2">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2 min-w-0">
                <span>Current bill</span>
                {cart.length > 0 && !savedOrder && (
                  <Badge tone="brand">{totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}</Badge>
                )}
                {savedOrder && (
                  <Badge tone="success">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    Saved {savedOrder?.invoice_no || savedOrder?.order?.invoice_no || ''}
                  </Badge>
                )}
              </h2>
              {cart.length > 0 && !savedOrder && (
                <Button variant="danger-quiet" size="sm" icon={Trash2} onClick={handleNewOrderClick}>Clear</Button>
              )}
            </div>

            {/* 2. Customer: optional, walk-in by default; no pop-up on the first item (UI review C3) */}
            <div className="flex-shrink-0 px-4 pb-3">
              {selectedCustomer ? (
                <div className="flex items-center gap-2 h-10 px-2.5 rounded-xl bg-brand-50 border border-brand-200">
                  <UserCheck className="w-4 h-4 text-brand-600 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="text-sm font-bold text-ink truncate">{selectedCustomer.name}</p>
                    <p className="text-xs text-ink-muted tabular-nums truncate">{selectedCustomer.customer_code} · {selectedCustomer.phone}</p>
                  </div>
                  {!savedOrder && (
                    <Button variant="ghost" size="sm" onClick={handleRemoveCustomer} aria-label="Remove customer from this bill">
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <TextInput
                    size="md"
                    icon={Phone}
                    value={inlinePhone}
                    onChange={(e) => setInlinePhone(e.target.value.replace(/[^\d+\s-]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setInlinePhone(''); setInlineSuggestions([]); }
                      if (e.key === 'Enter' && inlineSuggestions.length > 0) handlePickCustomer(inlineSuggestions[0]);
                    }}
                    placeholder={savedOrder ? 'Walk-in customer' : 'Walk-in · type phone to add customer'}
                    aria-label="Customer phone number (optional)"
                    disabled={!!savedOrder}
                    autoComplete="off"
                  />
                  {inlinePhone.trim().length >= 3 && !savedOrder && (
                    <div role="listbox" aria-label="Matching customers"
                      className="absolute left-0 right-0 top-full mt-1 z-30 bg-surface border border-line rounded-xl shadow-lg overflow-hidden">
                      {inlineSuggestions.map((c) => (
                        <button key={c.id} type="button" role="option" aria-selected="false"
                          onClick={() => handlePickCustomer(c)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-brand-50 cursor-pointer">
                          <span className="text-sm font-semibold text-ink truncate">{c.name}</span>
                          <span className="text-xs text-ink-muted tabular-nums">{c.phone}</span>
                        </button>
                      ))}
                      {!isSearchingInline && inlineSuggestions.length === 0 && (
                        <p className="px-3 py-2 text-xs text-ink-muted">No customer with this number yet.</p>
                      )}
                      <button type="button" onClick={handleRegisterNewCustomer}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-bold text-brand-700 border-t border-line hover:bg-brand-50 cursor-pointer">
                        <Plus className="w-4 h-4" aria-hidden="true" /> Register new customer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Cart lines: the only scrolling part */}
            <div className="flex-1 min-h-0 overflow-y-auto border-y border-line">
              {cart.length === 0 ? (
                <EmptyState icon={ShoppingCart} title="No items yet" message="Click an item on the left, or press / to search." />
              ) : (
                <ul className="divide-y divide-line">
                  {cart.map((item) => {
                    const priceNum = Number(item.price) || 0;
                    const qtyNum = Number(item.quantity) || 1;
                    return (
                      <li key={item.id} className="flex items-center gap-2 px-4 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{item.name || 'Item'}</p>
                          <p className="text-xs text-ink-subtle tabular-nums">{formatMoney(priceNum)} each</p>
                        </div>
                        <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${item.name}`}>
                          <button type="button" disabled={!!savedOrder} onClick={() => updateQuantity(item.id, -1)}
                            aria-label={`One less ${item.name}`}
                            className="w-7 h-7 rounded-lg border border-line bg-surface hover:bg-slate-100 text-ink flex items-center justify-center disabled:opacity-40 cursor-pointer">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold text-ink tabular-nums" aria-live="polite">{qtyNum}</span>
                          <button type="button" disabled={!!savedOrder} onClick={() => updateQuantity(item.id, 1)}
                            aria-label={`One more ${item.name}`}
                            className="w-7 h-7 rounded-lg bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="w-20 text-right text-sm font-bold text-ink tabular-nums">
                          {formatMoney(billingMath.lineTotal(priceNum, qtyNum))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 4. Pay panel: always visible */}
            <div className="flex-shrink-0 bg-slate-50/70 px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Subtotal</span>
                <span className="font-semibold text-ink tabular-nums">{formatMoney(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted">Discount</span>
                  <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70" role="radiogroup" aria-label="Discount type">
                    {[['FLAT', '₹'], ['PERCENT', '%']].map(([type, label]) => (
                      <button key={type} type="button" role="radio" aria-checked={discountType === type}
                        disabled={!!savedOrder} onClick={() => setDiscountType(type)}
                        className={`w-7 h-6 rounded-md text-xs font-bold cursor-pointer ${discountType === type ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-muted'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text" inputMode="decimal" aria-label={discountType === 'PERCENT' ? 'Discount percent' : 'Discount amount in rupees'}
                    disabled={!!savedOrder}
                    value={discountValue === 0 ? '' : discountValue}
                    onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="0"
                    className="h-8 w-16 bg-surface border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 rounded-lg px-2 text-right text-sm font-semibold text-ink tabular-nums outline-none disabled:opacity-50"
                  />
                </div>
                <span className="font-semibold text-brand-700 tabular-nums">−{formatMoney(computedDiscount)}</span>
              </div>

              <div className="flex items-baseline justify-between pt-2 border-t border-dashed border-slate-300">
                <span className="text-sm font-bold text-ink">Total</span>
                <span className="text-2xl font-black text-ink tabular-nums tracking-tight">{formatMoney(grandTotal)}</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Payment method">
                {[
                  { mode: 'CASH', label: 'Cash', Icon: Banknote },
                  { mode: 'UPI', label: 'UPI', Icon: Smartphone },
                  { mode: 'CARD', label: 'Card', Icon: CreditCard }
                ].map(({ mode, label, Icon }) => (
                  <button key={mode} type="button" role="radio" aria-checked={paymentMode === mode}
                    disabled={!!savedOrder} onClick={() => setPaymentMode(mode)}
                    className={`h-9 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-bold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                      paymentMode === mode
                        ? 'bg-brand-50 border-brand-600 text-brand-700 ring-1 ring-brand-600'
                        : 'bg-surface border-line text-ink-muted hover:bg-slate-50'
                    }`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Cash: received + change on one row, quick amounts below. Same height for UPI/Card. */}
              {paymentMode === 'CASH' ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted whitespace-nowrap">Cash received</span>
                    <MoneyInput
                      size="sm"
                      className="w-28"
                      aria-label="Cash received"
                      disabled={!!savedOrder}
                      value={cashReceived}
                      onChange={(v) => { setCashEdited(true); setCashReceived(v); }}
                      placeholder={String(billingMath.suggestedCash(grandTotal))}
                    />
                    <span className={`ml-auto text-sm font-bold tabular-nums whitespace-nowrap ${isCashSufficient ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {isCashSufficient ? `Change ${formatMoney(changeToReturn)}` : `Short ${formatMoney(Math.abs(changeToReturn))}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <Button variant="secondary" size="sm" disabled={!!savedOrder} onClick={setExactTender}
                      title="Exact amount (rounded up to the rupee)">
                      {formatMoney(billingMath.suggestedCash(grandTotal), { decimals: 0 })}
                    </Button>
                    {[50, 100, 500].map((amt) => (
                      <Button key={amt} variant="secondary" size="sm" disabled={!!savedOrder} onClick={() => addTenderAmount(amt)}>
                        +₹{amt}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="h-[4.25rem] flex items-center px-3 rounded-xl bg-surface border border-line text-sm text-ink-muted">
                  {paymentMode === 'UPI'
                    ? 'Check the payment shows as received on your UPI app before saving.'
                    : 'Check the card machine shows the payment as approved before saving.'}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 pt-0.5">
                <Button icon={Save} onClick={handleSaveOrder} loading={isSubmittingOrder}
                  disabled={!canSaveOrder || !!savedOrder}>
                  {savedOrder ? 'Saved' : 'Save bill'}
                </Button>
                <Button variant="dark" icon={Printer} disabled={!savedOrder} onClick={handlePrintReceipt}>
                  Print
                </Button>
                <Button variant="secondary" icon={RotateCcw} onClick={handleNewOrderClick}>
                  New bill
                </Button>
              </div>
            </div>
          </section>
        </div>

      </div>

      {/* PROMINENT SUCCESS TOAST POPUP (Non-Blocking, Auto-Dismiss 3s & Click-Away) */}
      {showSaveToast && (
        <div
          onClick={() => setShowSaveToast(null)}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto cursor-pointer animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <div className="bg-emerald-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500 ring-4 ring-emerald-500/20">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-black tracking-tight">Order Saved Successfully!</h4>
              <p className="text-xs font-semibold text-emerald-100">
                {showSaveToast.orderNumber ? `Invoice #${showSaveToast.orderNumber} • ` : ''}₹{(Number(showSaveToast.total) || 0).toFixed(2)} Paid
              </p>
            </div>
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-md font-semibold text-white/80 ml-2 hidden sm:inline">
              Click to dismiss
            </span>
          </div>
        </div>
      )}

      {/* NEW ORDER UNSAVED CART GUARD SAFETY MODAL */}
      {showNewOrderGuard && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-2">Discard Unsaved Order?</h3>
            
            <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
              Warning: Current order is not saved yet and information may be lost. Do you want to proceed and start a new order?
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowNewOrderGuard(false)}
                className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
              >
                No, Keep Order
              </button>

              <button
                type="button"
                onClick={resetOrderState}
                className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all"
              >
                Yes, Discard & Reset
              </button>
            </div>

          </div>
        </div>
      )}

      {/* THERMAL PRINT PREVIEW MODAL */}
      {showReceiptModal && savedOrder && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative my-8">
            <button
              onClick={() => setShowReceiptModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-emerald-600 font-black mb-3">
              <CheckCircle2 className="w-5 h-5" />
              <span>Bill Issued ({savedOrder?.order?.order_number || savedOrder?.order_number || savedOrder?.invoice_no || 'Saved'})</span>
            </div>

            {/* Paper Size selector */}
            <div className="flex items-center justify-between mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-600 font-bold">Paper Roll Size:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setRollSize('58mm')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    rollSize === '58mm' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  58mm Roll
                </button>
                <button
                  onClick={() => setRollSize('80mm')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    rollSize === '80mm' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  80mm Roll
                </button>
              </div>
            </div>

            {/* Thermal Receipt Preview */}
            <div className="my-4 max-h-96 overflow-y-auto rounded-xl p-2 bg-slate-50 border border-slate-200">
              <ThermalReceipt
                order={savedOrder?.order || savedOrder}
                items={savedOrder?.items || []}
                rollSize={rollSize}
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="py-3 px-4 bg-blue-600 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Thermal Receipt</span>
              </button>

              <button
                onClick={() => {
                  setShowReceiptModal(false);
                  resetOrderState();
                }}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Start Next Order</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CUSTOMER INFORMATION & AUTOCOMPLETE MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            
            <button
              onClick={handleSkipWalkIn}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              title="Skip and continue as walk-in"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center flex-shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Customer Information</h3>
                <p className="text-xs text-slate-400 font-medium">
                  {selectedCustomer ? 'Update attached customer profile' : 'Attach profile for loyalty spend & billing'}
                </p>
              </div>
            </div>

            {customerFormError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{customerFormError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmCustomer} className="space-y-4">
              
              {/* Phone Number Field with Autocomplete Dropdown */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  10-Digit Mobile Number <span className="text-blue-600">(Auto-Suggest)</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    autoFocus
                    placeholder="Type digits e.g. 98765..."
                    value={customerPhoneInput}
                    onChange={(e) => {
                      setCustomerPhoneInput(e.target.value);
                      if (selectedExistingCustomer && selectedExistingCustomer.phone !== e.target.value) {
                        setSelectedExistingCustomer(null);
                      }
                    }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  {isSearchingCustomers && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>

                {/* Autocomplete Suggestions Dropdown */}
                {customerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100">
                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Matching Registered Customers ({customerSuggestions.length})
                    </div>
                    {customerSuggestions.map(sug => (
                      <div
                        key={sug.id}
                        onClick={() => handleSelectCustomerSuggestion(sug)}
                        className="px-3.5 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between transition-colors group"
                      >
                        <div>
                          <span className="font-bold text-xs text-slate-900 group-hover:text-blue-700 block">
                            {sug.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {sug.phone}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                          {sug.customer_code}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer ID Badge if existing */}
              {selectedExistingCustomer && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="font-bold text-emerald-900 block">Existing Profile Matched</span>
                      <span className="text-[10px] text-emerald-700 font-mono">ID: {selectedExistingCustomer.customer_code}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExistingCustomer(null);
                      setCustomerNameInput('');
                    }}
                    className="text-[10px] text-emerald-800 font-bold hover:underline"
                  >
                    Clear Match
                  </button>
                </div>
              )}

              {/* Customer Name Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Name
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Enter customer full name..."
                    value={customerNameInput}
                    onChange={(e) => setCustomerNameInput(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                {!selectedExistingCustomer && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    New customer will be automatically assigned a sequential <strong>CUST-XXXX</strong> code.
                  </p>
                )}
              </div>

              {/* Action Buttons: Skip Walk-in vs Confirm */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSkipWalkIn}
                  className="py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>🚶 Skip / Walk-in</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingCustomer}
                  className="py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all text-center flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmittingCustomer ? 'Saving...' : 'Attach Customer'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
