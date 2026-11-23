import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ThermalReceipt } from '../components/ThermalReceipt';
import * as billingMath from '../utils/billing';
import { formatInvoiceFallback } from '../config/brand';
import {
  Plus, Minus, Trash2, Printer, CheckCircle2, Sparkles, X, Utensils, Coffee, CupSoda, Cake, AlertCircle, Save, RotateCcw, Package, CreditCard, Banknote, Users, Phone, UserCheck, Check, Smartphone
} from 'lucide-react';

export function BillingView({ searchQuery, setSearchQuery, searchInputRef }) {
  const { user, authFetch } = useAuth();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);

  // Customer CRM State
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { id, customer_code, name, phone } | null
  const [isGuestOrder, setIsGuestOrder] = useState(false);
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

  const addToCart = (item) => {
    if (!item || savedOrder) return; // Cart locked once order is saved until New Order clicked
    
    // First item trigger: Open Customer Information modal if no customer attached and not marked as guest
    if (cart.length === 0 && !selectedCustomer && !isGuestOrder) {
      setPendingItemToAdd(item);
      setCustomerPhoneInput('');
      setCustomerNameInput('');
      setSelectedExistingCustomer(null);
      setCustomerSuggestions([]);
      setCustomerFormError('');
      setShowCustomerModal(true);
      return;
    }

    actuallyAddItemToCart(item);
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

  const handleOpenChangeCustomer = () => {
    if (savedOrder) return;
    if (selectedCustomer) {
      setSelectedExistingCustomer(selectedCustomer);
      setCustomerPhoneInput(selectedCustomer.phone);
      setCustomerNameInput(selectedCustomer.name);
    } else {
      setSelectedExistingCustomer(null);
      setCustomerPhoneInput('');
      setCustomerNameInput('');
    }
    setPendingItemToAdd(null);
    setCustomerSuggestions([]);
    setCustomerFormError('');
    setShowCustomerModal(true);
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

  // Auto-fill cashReceived when grandTotal changes or CASH mode selected (rounded UP so it covers the bill)
  useEffect(() => {
    if (paymentMode === 'CASH' && !cashReceived) {
      setCashReceived(String(billingMath.suggestedCash(grandTotal)));
    }
  }, [grandTotal, paymentMode]);

  // Cash Tender Math & Validation Rules
  const cashReceivedVal = parseFloat(cashReceived) || 0;
  const changeToReturn = paymentMode === 'CASH' ? billingMath.cashChange(cashReceivedVal, grandTotal) : 0;
  const isCashSufficient = paymentMode === 'CASH' ? billingMath.isCashEnough(cashReceivedVal, grandTotal) : true;
  const canSaveOrder = cart.length > 0 && !savedOrder && !isSubmittingOrder && (isDigitalPayment || isCashSufficient);

  // Quick denomination adders
  const addTenderAmount = (extra) => {
    if (isDigitalPayment || savedOrder) return;
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
      alert(`⚠️ Cash received (₹${cashReceivedVal}) is less than Total (₹${grandTotal.toFixed(2)})`);
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
      alert(`Save Error: ${err.message}`);
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

  // Vector Category Icon Resolver
  const getCategoryVectorIcon = (name = '') => {
    const l = name.toLowerCase();
    if (l.includes('roll') || l.includes('snack')) return Utensils;
    if (l.includes('bev') || l.includes('drink')) return CupSoda;
    if (l.includes('tea') || l.includes('coffee')) return Coffee;
    if (l.includes('dessert') || l.includes('sweet')) return Cake;
    return Package;
  };

  return (
    <div className="w-full h-full max-w-7xl mx-auto flex flex-col min-h-0 overflow-hidden">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch h-full min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Categories & Menu Catalog Grid (7-8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 h-full flex flex-col min-h-0 overflow-hidden space-y-3">
          
          {/* Category Filter Pills (Pinned Top) */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Categories
              </h2>
              <span className="text-[11px] text-slate-500 font-semibold">{categories.length + 1} Available</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              
              {/* All Category Pill */}
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`p-3 rounded-2xl border text-left transition-all duration-200 flex items-center gap-2.5 ${
                  selectedCategory === 'ALL'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs ring-1 ring-blue-600 font-bold'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 font-medium'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                  selectedCategory === 'ALL' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold truncate">All Menu</h3>
                  <p className={`text-[10px] font-medium ${selectedCategory === 'ALL' ? 'text-blue-600/80' : 'text-slate-400'}`}>
                    {items.length} Items
                  </p>
                </div>
              </button>

              {/* Dynamic Categories */}
              {categories.map((cat) => {
                const isSelected = selectedCategory === String(cat.id);
                const CatIcon = getCategoryVectorIcon(cat.name);
                const itemCount = items.filter(i => i.category_id === cat.id).length;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(String(cat.id))}
                    className={`p-3 rounded-2xl border text-left transition-all duration-200 flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs ring-1 ring-blue-600 font-bold'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 font-medium'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      <CatIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold truncate">{cat.name}</h3>
                      <p className={`text-[10px] font-medium ${isSelected ? 'text-blue-600/80' : 'text-slate-400'}`}>
                        {itemCount} Items
                      </p>
                    </div>
                  </button>
                );
              })}

            </div>
          </div>

          {/* Menu Catalog Grid */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Select Menu Items
              </h2>
              <span className="text-xs text-slate-500 font-semibold">{filteredItems.length} items available</span>
            </div>

            {loading ? (
              <div className="text-center py-16 text-slate-400 text-sm">Loading items...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm">
                No items match your search.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 content-start auto-rows-max scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400">
                {filteredItems.map((item) => {
                  const inCartItem = cart.find(c => c.id === item.id);
                  const imgPath = formatImageUrl(item.image_url);

                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => addToCart(item)}
                      disabled={!!savedOrder}
                      className={`group rounded-2xl border overflow-hidden transition-all duration-200 flex flex-col justify-between bg-white text-left h-fit ${
                        savedOrder ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-blue-600 hover:shadow-md'
                      } ${
                        inCartItem
                          ? 'border-blue-600 shadow-md ring-2 ring-blue-600'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Fixed Image Container */}
                      <div className="w-full h-28 relative overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center">
                        {imgPath ? (
                          <img
                            src={imgPath}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              if (e.target.nextElementSibling) {
                                e.target.nextElementSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        {/* Fallback Icon when Image is Missing or Broken */}
                        <div
                          className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100 p-2 text-center"
                          style={{ display: imgPath ? 'none' : 'flex' }}
                        >
                          <Utensils className="w-6 h-6 text-slate-400 mb-1" />
                          <span className="text-[10px] font-bold text-slate-600 uppercase truncate max-w-full">
                            {item.name}
                          </span>
                        </div>

                        {/* Top-Right Plus Cart Button */}
                        <div
                          className={`absolute top-2 right-2 w-7 h-7 rounded-xl flex items-center justify-center font-bold shadow-xs transition-transform active:scale-95 z-10 ${
                            inCartItem
                              ? 'bg-blue-600 text-white font-bold'
                              : 'bg-white/90 text-slate-800 group-hover:bg-blue-600 group-hover:text-white'
                          }`}
                        >
                          {inCartItem ? (
                            <span className="text-xs font-bold tabular-nums">{inCartItem.quantity}</span>
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>

                      {/* Content Section: Name, Category, Price & Badge */}
                      <div className="p-3 flex flex-col justify-between flex-1 w-full">
                        <div>
                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1 leading-snug group-hover:text-blue-600 transition-colors">
                            {item.name}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5 capitalize truncate">
                            {item.category_name || 'General'}
                          </p>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-extrabold text-blue-600 tabular-nums">
                            ₹{Number(item.price).toFixed(2)}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                            Ready
                          </span>
                        </div>
                      </div>

                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Detail Items / Cart Panel (Full-Panel Vertical Scrollable) */}
        <div className="lg:col-span-5 xl:col-span-4 h-full min-h-0">
          <div className="flex flex-col h-full overflow-y-auto bg-white border border-slate-200/80 rounded-3xl shadow-sm scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400">
            
            {/* 1. CART HEADER: "Detail Items" & Customer Tag Chip (flex-shrink-0 Top Block) */}
            <div className="flex-shrink-0 border-b border-slate-100 bg-white z-10 rounded-t-3xl">
              
              {/* Top Row: Title & Clear */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-2.5">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Detail Items</span>
                    {cart.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold tabular-nums border border-blue-200">
                        {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                      </span>
                    )}
                  </h3>
                  {savedOrder && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Marked Paid ({savedOrder?.order?.order_number || savedOrder?.order_number || savedOrder?.invoice_no || 'Saved'})
                    </span>
                  )}
                </div>

                {cart.length > 0 && !savedOrder && (
                  <button
                    onClick={handleNewOrderClick}
                    className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold px-2.5 py-1 rounded-xl border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {/* Customer Profile Status & Change Chip */}
              <div className="px-4 sm:px-5 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-5.5 h-5.5 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${
                    selectedCustomer 
                      ? 'bg-blue-600 text-white shadow-xs' 
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {selectedCustomer ? <UserCheck className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                  </div>
                  <div className="min-w-0">
                    {selectedCustomer ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {selectedCustomer.name}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200">
                          {selectedCustomer.customer_code}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                          ({selectedCustomer.phone})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">
                        {isGuestOrder ? '🚶 Walk-in Guest (No Customer ID)' : '👤 No Customer Attached'}
                      </span>
                    )}
                  </div>
                </div>

                {!savedOrder && (
                  <button
                    onClick={handleOpenChangeCustomer}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer"
                  >
                    <span>{selectedCustomer ? 'Change' : '+ Tag'}</span>
                  </button>
                )}
              </div>

            </div>

            {/* 2. FULL-LENGTH CART ITEMS LIST (No internal nested scrollbox) */}
            <div className="p-3 sm:p-4 space-y-2 h-auto overflow-visible">
              {cart.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl mb-2">
                    🛒
                  </div>
                  <p className="text-sm font-bold text-slate-700">Cart is Empty</p>
                  <p className="text-xs text-slate-400 mt-0.5">Select menu items to add to bill</p>
                </div>
              ) : (
                cart.map((item) => {
                  const imgPath = formatImageUrl(item.image_url);
                  const priceNum = Number(item.price) || 0;
                  const qtyNum = Number(item.quantity) || 1;
                  return (
                    <div
                      key={item.id}
                      className="p-2 sm:p-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-100/80 border border-slate-200/60 flex items-center justify-between gap-2.5 transition-colors group"
                    >
                      {/* Item Thumbnail */}
                      <div className="w-11 h-11 rounded-xl bg-white border border-slate-200/80 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                        {imgPath ? (
                          <img
                            src={imgPath}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              if (e.target.nextElementSibling) {
                                e.target.nextElementSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className="w-full h-full flex items-center justify-center bg-slate-50"
                          style={{ display: imgPath ? 'none' : 'flex' }}
                        >
                          <Utensils className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                      {/* Title, Category & Stepper */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate leading-snug">
                          {item.name || 'Menu Item'}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-medium truncate mb-1">
                          {item.category_name || 'General'}
                        </p>

                        {/* Stepper with Royal Blue Plus */}
                        <div className="flex items-center gap-1.5">
                          <button
                            disabled={!!savedOrder}
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-5 h-5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-slate-900 tabular-nums">
                            {qtyNum}
                          </span>
                          <button
                            disabled={!!savedOrder}
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-5 h-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center text-xs font-bold transition-all active:scale-95 shadow-xs shadow-blue-500/20 disabled:opacity-40"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal Calculation */}
                      <div className="text-right flex-shrink-0">
                        {qtyNum > 1 && (
                          <span className="text-[10px] text-slate-400 font-semibold block tabular-nums">
                            {qtyNum} × ₹{priceNum.toFixed(2)}
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-900 tabular-nums">
                          ₹{(priceNum * qtyNum).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 3. BILLING SUMMARY & ACTIONS - Natural Flow pushed to bottom via mt-auto */}
            <div className="flex-shrink-0 mt-auto bg-slate-50/80 border-t border-slate-200 p-4 sm:p-5 rounded-b-3xl space-y-2.5 z-20 shadow-xs">
              
              {/* Item count row */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Item</span>
                <span className="font-bold text-slate-800 tabular-nums">{totalItemCount} (Items)</span>
              </div>

              {/* Subtotal row */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Subtotal</span>
                <span className="font-bold text-slate-900 tabular-nums">₹{subtotal.toFixed(2)}</span>
              </div>

              {/* Discount row with ENLARGED input & toggle */}
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-semibold text-xs">Discount</span>
                  <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      disabled={!!savedOrder}
                      onClick={() => setDiscountType('FLAT')}
                      className={`px-2 py-1 text-[10px] font-bold rounded ${
                        discountType === 'FLAT' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ₹
                    </button>
                    <button
                      type="button"
                      disabled={!!savedOrder}
                      onClick={() => setDiscountType('PERCENT')}
                      className={`px-2 py-1 text-[10px] font-bold rounded ${
                        discountType === 'PERCENT' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    disabled={!!savedOrder}
                    value={discountValue === 0 ? '' : discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0"
                    className="h-8.5 w-20 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-lg px-2.5 py-1 text-right text-xs font-bold text-slate-900 tabular-nums outline-none disabled:opacity-50"
                  />
                </div>
                <span className="font-bold text-blue-600 tabular-nums text-xs">
                  - ₹{computedDiscount.toFixed(2)}
                </span>
              </div>

              {/* Dashed line separator */}
              <div className="border-t border-dashed border-slate-200 my-1.5"></div>

              {/* Total row */}
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-slate-900">Total</span>
                <span className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums tracking-tight">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>

              {/* Payment Method Selector: CASH / UPI / CARD */}
              <div className="pt-0.5">
                <h4 className="text-xs font-bold text-slate-800 tracking-tight mb-1.5">Payment Method</h4>
                <div className="grid grid-cols-3 gap-2">
                  
                  {/* Mode 1: Cash Tile */}
                  <button
                    type="button"
                    disabled={!!savedOrder}
                    onClick={() => setPaymentMode('CASH')}
                    className={`py-2.5 px-3 rounded-2xl border flex items-center justify-center gap-2 transition-all text-center ${
                      paymentMode === 'CASH'
                        ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600 font-bold shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 font-medium'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold">CASH</span>
                  </button>

                  {/* Modes 2 & 3: UPI and Card Tiles */}
                  {[
                    { mode: 'UPI', label: 'UPI', Icon: Smartphone },
                    { mode: 'CARD', label: 'CARD', Icon: CreditCard }
                  ].map(({ mode, label, Icon }) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={!!savedOrder}
                      onClick={() => setPaymentMode(mode)}
                      className={`py-2.5 px-3 rounded-2xl border flex items-center justify-center gap-2 transition-all text-center ${
                        paymentMode === mode
                          ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600 font-bold shadow-xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 font-medium'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold">{label}</span>
                    </button>
                  ))}

                </div>
              </div>

              {/* Tendered Amount Block (Permanently Mounted for Zero Layout Shift) */}
              <div className={`p-3 rounded-2xl border transition-all duration-200 space-y-2.5 ${
                isDigitalPayment
                  ? 'bg-slate-50/80 border-slate-200 opacity-40 pointer-events-none cursor-not-allowed select-none'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-slate-700">Tendered Amount (₹):</span>
                  <input
                    type="number"
                    min="0"
                    disabled={isDigitalPayment || !!savedOrder}
                    value={isDigitalPayment ? '' : cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={isDigitalPayment ? 'Auto' : `₹${billingMath.suggestedCash(grandTotal)}`}
                    className="h-10 w-28 sm:w-32 bg-white border-2 border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-1.5 text-right text-sm font-black text-slate-900 tabular-nums outline-none disabled:opacity-50 transition-all"
                  />
                </div>

                {/* ENLARGED Recommended Cash Quick-Fill Buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    disabled={isDigitalPayment || !!savedOrder}
                    onClick={setExactTender}
                    className="py-2 px-1 rounded-xl bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-900 text-xs font-bold border border-slate-200 tabular-nums text-center shadow-2xs active:scale-95 transition-all truncate"
                    title={`Exact ₹${billingMath.suggestedCash(grandTotal)}`}
                  >
                    ₹{billingMath.suggestedCash(grandTotal)}
                  </button>
                  <button
                    type="button"
                    disabled={isDigitalPayment || !!savedOrder}
                    onClick={() => addTenderAmount(50)}
                    className="py-2 px-1 rounded-xl bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-800 text-xs font-bold border border-slate-200 text-center shadow-2xs active:scale-95 transition-all"
                  >
                    +₹50
                  </button>
                  <button
                    type="button"
                    disabled={isDigitalPayment || !!savedOrder}
                    onClick={() => addTenderAmount(100)}
                    className="py-2 px-1 rounded-xl bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-800 text-xs font-bold border border-slate-200 text-center shadow-2xs active:scale-95 transition-all"
                  >
                    +₹100
                  </button>
                  <button
                    type="button"
                    disabled={isDigitalPayment || !!savedOrder}
                    onClick={() => addTenderAmount(500)}
                    className="py-2 px-1 rounded-xl bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-800 text-xs font-bold border border-slate-200 text-center shadow-2xs active:scale-95 transition-all"
                  >
                    +₹500
                  </button>
                </div>

                {/* UI Feedback: Return Change vs Shortfall vs Auto-Paid */}
                <div className="pt-1 border-t border-slate-200">
                  {isDigitalPayment ? (
                    <div className="flex justify-between items-center text-xs p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 font-semibold">
                      <span>Status:</span>
                      <span className="font-bold text-slate-700">Digital / Auto Paid</span>
                    </div>
                  ) : isCashSufficient ? (
                    <div className="flex justify-between items-center text-xs p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">
                      <span>Return Change:</span>
                      <span className="text-sm font-black tabular-nums">
                        ₹{changeToReturn.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center text-xs p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                      <span>Short by:</span>
                      <span className="text-sm font-black tabular-nums">
                        ₹{Math.abs(changeToReturn).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3-STEP CHECKOUT ACTIONS */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                
                {/* 1. Save / Paid (Disabled once saved or submitting) */}
                <button
                  disabled={!canSaveOrder || !!savedOrder || isSubmittingOrder}
                  onClick={handleSaveOrder}
                  className={`py-2.5 px-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1 text-center active:scale-95 ${
                    !canSaveOrder || !!savedOrder || isSubmittingOrder
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span className="truncate">{isSubmittingOrder ? 'Saving...' : savedOrder ? 'Paid' : 'Save / Paid'}</span>
                </button>

                {/* 2. Print (Enabled once saved) */}
                <button
                  disabled={!savedOrder}
                  onClick={handlePrintReceipt}
                  className={`py-2.5 px-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl border border-slate-800 transition-all flex items-center justify-center gap-1 text-center active:scale-95 ${
                    !savedOrder
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-slate-800 shadow-md'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                  <span>Print</span>
                </button>

                {/* 3. New Order (Always enabled, resets state & focuses search) */}
                <button
                  onClick={handleNewOrderClick}
                  className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1 text-center active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span className="truncate">New Order</span>
                </button>

              </div>

            </div>

          </div>
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
