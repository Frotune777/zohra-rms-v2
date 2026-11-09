import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {flushSync} from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiSearch, FiBell, FiGlobe, FiGrid, FiList, FiMinus, FiPlus, FiX, FiPrinter, FiSave } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

const emptyDetails = () => ({customerName:'',customerPhone:'',notes:'',discount:'0',amountPaid:'',partialPaymentMode:'Cash'});
const readStoredDraft = key => {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) || '{}');
    return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  } catch { return {}; }
};
const actor = () => {try{return JSON.parse(localStorage.getItem('user') || '{}').id || 'session';}catch{return 'session';}};
const scopedKey = (actorId, table, type) => 'pos-draft:'+actorId+':'+(type==='Dine In' ? 'table:'+encodeURIComponent(table) : 'type:'+type);
const canonical = value => JSON.stringify(value, (_,item) => item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);

const POS = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tables, setTables] = useState([]);
  const [tableState, setTableState] = useState('loading');
  const [reload, setReload] = useState(0);
  const {user} = useAuth();
  const actorId = user?.id || actor();
  const scopedLegacyKey = 'pos-draft:'+actorId;
  const oldLegacy = readStoredDraft('pos-draft:session');
  const scopedLegacy = readStoredDraft(scopedLegacyKey);
  const legacyKey = Array.isArray(scopedLegacy.items) && scopedLegacy.items.length ? scopedLegacyKey : Array.isArray(oldLegacy.items) && oldLegacy.items.length ? 'pos-draft:session' : scopedLegacyKey;
  const legacy = readStoredDraft(legacyKey);
  const hasLegacy = Array.isArray(legacy.items) && legacy.items.length > 0;
  const resumeLegacy = params.get('draft') === 'legacy' && hasLegacy;
  const type = resumeLegacy ? legacy.type || 'Dine In' : params.get('type') || 'Dine In';
  const table = resumeLegacy ? legacy.details?.tableNumber || '' : params.get('table');
  const tableOption = tables.find(option => option.value === table);
  const key = resumeLegacy ? legacyKey : scopedKey(actorId,table,type);
  const hasSavedCart = Array.isArray(readStoredDraft(key).items) && readStoredDraft(key).items.length > 0;
  const selected = resumeLegacy || ['Delivery','Pick Up'].includes(type) || (type==='Dine In' && table && (tableOption || hasSavedCart));

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      toast.error('Please login to access POS');
      navigate('/login');
      return;
    }
    let active = true;
    setTableState('loading');
    api.get('tables').then(response => {
      if (active) {setTables(response.data);setTableState('ready');}
    }).catch(error => {
      if (active) {
        setTableState('error');
        if (error.response?.status===401) navigate('/login');
      }
    });
    return () => {active=false;};
  }, [navigate,reload]);

  const openOrder = (nextType, nextTable) => setParams(nextType==='Dine In' ? {table:nextTable} : {type:nextType});
  if (selected) return <POSOrder key={key} draftKey={key} legacyDraft={resumeLegacy} orderType={type} tableNumber={table || ''}
    tableLabel={tableOption?.label || (table ? 'Table '+table : 'Saved dine-in order')}
    onHome={() => setParams({})} onOrderType={nextType => nextType==='Dine In' ? setParams({}) : openOrder(nextType)} />;

  const draftCount = option => {
    const items = readStoredDraft(scopedKey(actorId,option.value,'Dine In')).items;
    return Array.isArray(items) ? items.reduce((sum,item)=>sum+Number(item.qty || 0),0) : 0;
  };
  return <div className="pos-home min-h-[calc(100dvh-3.5rem)] bg-gray-100 p-4 sm:p-8 text-gray-800">
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold">Select a table</h1>
      <p className="mt-2 text-gray-600">Choose a table to add items for your customer.</p>
      <div className="flex flex-wrap gap-3 my-6">
        {['Delivery','Pick Up'].map(nextType=><button key={nextType} onClick={()=>openOrder(nextType)} className="rounded-lg bg-gray-800 text-white px-5 py-3 font-semibold">{nextType}</button>)}
        {hasLegacy && <button onClick={()=>setParams({draft:'legacy'})} className="rounded-lg border border-gray-600 px-5 py-3">Resume previous saved order</button>}
      </div>
      {(params.has('table') || params.has('type') || params.has('draft')) && tableState==='ready' && <p role="alert" className="mb-4 text-red-700">This table or saved order is unavailable. Choose a table below.</p>}
      {tableState==='loading' && <p role="status">Loading tables…</p>}
      {tableState==='error' && <div role="alert"><p>Unable to load tables.</p><button onClick={()=>setReload(value=>value+1)} className="mt-3 border rounded px-4 py-2">Retry loading tables</button></div>}
      {tableState==='ready' && (tables.length ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map(option=><button key={option.value} aria-label={option.label} onClick={()=>openOrder('Dine In',option.value)} className="bg-white border border-gray-200 rounded-xl p-6 text-left shadow-sm hover:border-red-500 hover:shadow-md focus-visible:outline-red-600">
          <FiGrid className="text-red-600 mb-4" size={28} />
          <span className="block text-xl font-bold">{option.label}</span>
          <span className="block mt-2 text-sm text-gray-600">{draftCount(option) ? 'Saved cart · '+draftCount(option)+' items' : 'Start an order'}</span>
        </button>)}
      </div> : <p>No dining tables are active. Ask a manager to update Configuration.</p>)}
    </div>
  </div>;
};

const POSOrder = ({draftKey,legacyDraft,orderType,tableNumber,tableLabel,onHome,onOrderType}) => {
  const navigate = useNavigate();
  const [menu, setMenu] = useState([]);
  const [menuState, setMenuState] = useState('loading');
  const [menuReload, setMenuReload] = useState(0);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const readDraft = () => readStoredDraft(draftKey);
  const [cart, setCart] = useState(()=>Array.isArray(readDraft().items) ? readDraft().items : []);
  const [details,setDetails]=useState(()=>({...emptyDetails(),...readDraft().details}));
  const [receipt,setReceipt]=useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMode, setPaymentMode] = useState(()=>readDraft().paymentMode || 'Cash');

  useEffect(()=>{
    if(cart.length) sessionStorage.setItem(draftKey,JSON.stringify({...readDraft(),items:cart,type:orderType,paymentMode,details}));
    else sessionStorage.removeItem(draftKey);
  },[cart,orderType,paymentMode,details,draftKey]);
  const changeDetail=(name,value)=>setDetails(d=>({...d,[name]:value}));
  // Load Menu
  useEffect(() => {
    const loadMenu = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please login to access POS');
        navigate('/login');
        return;
      }

      setMenuState('loading');
      try {
        const response = await api.get('menu');
        setMenuState('ready');
        setMenu(response.data);

        // Extract Categories
        const cats = ['All', ...new Set(response.data.map(item => item.category))];
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load menu:', err);
        setMenuState('error');
        toast.error('Failed to load menu');
        if (err.response && err.response.status === 401) {
          navigate('/login');
        }
      }
    };
    loadMenu();
  }, [navigate,menuReload]);

  const addToCart = (item) => {
    setCart(prev => {
      const exist = prev.find(i => i.id === item.id);
      if (exist) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const calculateTotal = () => {
    const base=cart.reduce((sum,item)=>sum+Number(item.price)*item.qty,0);
    const discount=Math.min(base,Math.max(0,Number(details.discount || 0)));
    return cart.reduce((sum,item)=>sum+Number(item.price)*item.qty*(base?(base-discount)/base:1)*(1+Number(item.rate_percentage || 0)),0);
  };
  const handleCheckout = async (print = false) => {
    if (!cart.length || loading) return;
    setLoading(true);
    const payload={items:cart,type:orderType,paymentMode,...details};
    if (!legacyDraft) payload.tableNumber=orderType==='Dine In'?tableNumber:'';
    const previous=readDraft();
    const key=previous.request&&canonical(previous.request)===canonical(payload)?previous.key:crypto.randomUUID();
    sessionStorage.setItem(draftKey,JSON.stringify({...previous,request:payload,key}));
    try {
      const response=await api.post('/orders',payload,{headers:{'Idempotency-Key':key}});
      flushSync(()=>setReceipt(response.data));
      if (print) window.print();
      toast.success(print ? 'Order Saved & Printed!' : 'Order Saved!');
      setCart([]);setDetails(emptyDetails());setPaymentMode('Cash');
      sessionStorage.removeItem(draftKey);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save order. Retry with the same details.');
    } finally { setLoading(false); }
  };

  const filteredMenu = useMemo(() => {
    return menu.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menu, selectedCategory, searchQuery]);

  return (
    <div className="pos-screen flex flex-col sm:flex-row h-[calc(100dvh-3.5rem)] w-full bg-gray-100 text-gray-800 font-sans overflow-hidden">

      {/* LEFT SIDEBAR - CATEGORIES - Hidden on mobile */}
      <div className="hidden md:flex w-40 lg:w-48 bg-gray-800 flex-col text-gray-300">
        <div className="p-2 md:p-4 border-b border-gray-700 font-bold text-white text-sm md:text-base">Categories</div>
        <div className="flex-1 overflow-y-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left p-2 md:p-4 hover:bg-gray-700 transition-colors border-l-4 text-xs md:text-sm ${selectedCategory === cat ? 'border-green-500 bg-gray-700 text-white' : 'border-transparent'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* CENTER - MENU GRID */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-200">
        <div className="bg-white px-3 py-2 border-b flex items-center gap-3">
          <button onClick={onHome} disabled={loading} className="border rounded px-3 py-2 text-sm">Back to tables</button>
          <h1 className="font-bold">{orderType==='Dine In' ? tableLabel : orderType}</h1>
        </div>
        {/* Top Bar */}
        <div className="bg-white p-2 flex items-center gap-4 shadow-sm">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input aria-label="Search query"
              type="text"
              placeholder="Search item..."
              className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:border-red-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 text-gray-600">
            <button aria-label="Notifications" className="p-2 hover:bg-gray-100 rounded"><FiBell /></button>
            <button aria-label="Language" className="p-2 hover:bg-gray-100 rounded"><FiGlobe /></button>
          </div>
        </div>

        {menuState==='loading' && <p role="status" className="p-4">Loading menu…</p>}
        {menuState==='error' && <div role="alert" className="p-4">Unable to load menu. <button onClick={()=>setMenuReload(value=>value+1)} className="border rounded px-3 py-2">Retry loading menu</button></div>}
        {/* Grid */}
        <div className="flex-1 p-2 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {filteredMenu.map(item => (
              <button
                key={item.id}
                aria-label={item.name+' ₹'+item.price}
                disabled={loading}
                onClick={() => addToCart(item)}
                className="bg-white p-2 rounded shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-center h-24 text-center border border-transparent hover:border-red-500"
              >
                <span className="font-semibold text-sm line-clamp-2">{item.name}</span>
                <span className="text-xs text-gray-500 mt-1">₹{item.price}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR - CART/BILLING - Responsive width */}
      <div className="w-full sm:w-80 md:w-96 bg-white shadow-xl flex flex-col border-l border-gray-300">

        {/* Order Type Tabs */}
        <div className="flex text-sm font-bold text-white">
          {['Dine In', 'Delivery', 'Pick Up'].map(type => (
            <button
              key={type}
              disabled={loading}
              onClick={() => onOrderType(type)}
              className={`flex-1 py-3 text-center transition-colors ${orderType === type ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        <fieldset disabled={loading} className="p-2 border-b grid grid-cols-2 gap-2 text-sm bg-gray-50">
          <input aria-label="Customer name" className="border p-1 rounded" placeholder="Customer name" value={details.customerName} onChange={e=>changeDetail('customerName',e.target.value)}/>
          <input aria-label="Customer phone" className="border p-1 rounded" placeholder="Customer phone (optional)" value={details.customerPhone} onChange={e=>changeDetail('customerPhone',e.target.value)}/>
          <input aria-label="Order notes" className="border p-1 rounded" placeholder="Order notes" value={details.notes} onChange={e=>changeDetail('notes',e.target.value)}/>
          <label>Discount (₹)<input aria-label="Order discount" className="border p-1 rounded w-full" type="number" min="0" step="0.01" value={details.discount} onChange={e=>changeDetail('discount',e.target.value)}/></label>
          {paymentMode==='Part'&&<><label>Paid now (₹)<input aria-label="Amount paid now" className="border p-1 rounded w-full" type="number" min="0.01" step="0.01" value={details.amountPaid} onChange={e=>changeDetail('amountPaid',e.target.value)}/></label><select aria-label="Partial payment mode" className="border p-1 rounded" value={details.partialPaymentMode} onChange={e=>changeDetail('partialPaymentMode',e.target.value)}>{['Cash','Card','UPI','Bank Transfer'].map(m=><option key={m}>{m}</option>)}</select></>}
        </fieldset>

        {/* Cart Items Header */}
        <div className="flex bg-gray-100 text-xs font-bold text-gray-500 p-2 border-b">
          <div className="flex-1">ITEM</div>
          <div className="w-16 text-center">QTY</div>
          <div className="w-16 text-right">PRICE</div>
          <div className="w-8"></div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
              <FiList size={48} className="mb-2" />
              <p>No Item Selected</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex items-center text-sm py-2 border-b border-dashed border-gray-200">
                <div className="flex-1 font-medium">{item.name}</div>
                <div className="w-20 flex items-center justify-center gap-2">
                  <button aria-label="Decrease quantity" disabled={loading} onClick={() => updateQty(item.id, -1)} className="text-gray-400 hover:text-red-500"><FiMinus size={12} /></button>
                  <span>{item.qty}</span>
                  <button aria-label="Increase quantity" disabled={loading} onClick={() => updateQty(item.id, 1)} className="text-gray-400 hover:text-green-500"><FiPlus size={12} /></button>
                </div>
                <div className="w-16 text-right">{(item.price * item.qty).toFixed(0)}</div>
                <button aria-label="Close" disabled={loading} onClick={() => updateQty(item.id, -item.qty)} className="w-8 flex justify-center text-gray-300 hover:text-red-500">
                  <FiX />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer / Actions */}
        <div className="bg-gray-800 text-white p-3">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400">Total incl. tax</span>
            <span className="text-2xl font-bold">₹ {calculateTotal().toFixed(2)}</span>
          </div>

          {/* Payment Modes */}
          <div className="flex gap-2 mb-3 text-xs">
            {['Cash', 'Card', 'Due', 'Part'].map(mode => (
              <label key={mode} className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMode"
                  className="peer sr-only"
                  disabled={loading}
                  checked={paymentMode === mode}
                  onChange={() => setPaymentMode(mode)}
                />
                <div className="text-center py-1 rounded border border-gray-600 peer-checked:bg-white peer-checked:text-black peer-checked:font-bold hover:bg-gray-700 transition-all">
                  {mode}
                </div>
              </label>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleCheckout(false)}
              disabled={cart.length === 0 || loading}
              className="bg-red-600 hover:bg-red-700 text-white py-3 font-bold rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSave /> SAVE
            </button>
            <button
              onClick={() => handleCheckout(true)}
              disabled={cart.length === 0 || loading}
              className="bg-gray-700 hover:bg-gray-600 text-white py-3 font-bold rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiPrinter /> SAVE & PRINT
            </button>
            <button onClick={()=>handleCheckout(false)} disabled={!cart.length||loading} className="bg-orange-600 hover:bg-orange-700 text-white py-2 font-bold rounded text-sm">
              KOT
            </button>
            <button onClick={()=>handleCheckout(true)} disabled={!cart.length||loading} className="bg-gray-700 hover:bg-gray-600 text-white py-2 font-bold rounded text-sm">
              KOT & PRINT
            </button>
          </div>
        </div>
      </div>
      {receipt&&<div className="pos-receipt hidden"><h1>Al Zohra</h1><p>{receipt.orderNumber}</p><p>{receipt.order.order_type} {receipt.order.table_number}</p>{receipt.items.map(i=><p key={i.id}>{i.qty} × {i.name}: ₹{i.lineTotal.toFixed(2)}</p>)}<p>Discount: ₹{receipt.order.discount_amount}</p><p>Tax: ₹{receipt.order.tax_amount}</p><p>Total: ₹{receipt.totalAmount.toFixed(2)}</p><p>Paid: ₹{receipt.paidAmount.toFixed(2)} · Due: ₹{receipt.outstanding.toFixed(2)}</p><p>{receipt.order.notes}</p></div>}
    </div>
  );
};

export default POS;
