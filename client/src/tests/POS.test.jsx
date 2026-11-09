import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import POS from '../pages/POS';
import api from '../utils/api';
import {useAuth} from '../context/AuthContext';
vi.mock('../context/AuthContext',()=>({useAuth:vi.fn()}));

vi.mock('../utils/api', () => ({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('react-hot-toast', () => ({toast:{error:vi.fn(),success:vi.fn()}}));
const mockNavigate=vi.fn();
vi.mock('react-router-dom',async()=>({...await vi.importActual('react-router-dom'),useNavigate:()=>mockNavigate}));
const menu=[
  {id:1,name:'Chicken Biryani',price:150,category:'Main Course'},
  {id:2,name:'Coke',price:40,category:'Beverages'},
];
const tables=Array.from({length:12},(_,index)=>({value:String(index+1),label:'Table '+(index+1)}));
const receipt={orderNumber:'ORD-test',order:{order_type:'Dine In',table_number:'1'},items:[{id:1,qty:1,name:'Chicken Biryani',lineTotal:150}],totalAmount:150,paidAmount:150,outstanding:0};
const renderPOS=(path='/')=>render(<MemoryRouter initialEntries={[path]}><POS/></MemoryRouter>);
const selectTable=async(number='1')=>fireEvent.click(await screen.findByRole('button',{name:'Table '+number,exact:true}));
const addItem=async(name='Chicken Biryani')=>fireEvent.click(await screen.findByRole('button',{name:new RegExp('^'+name+' ₹')}));
const save=()=>fireEvent.click(screen.getByRole('button',{name:'SAVE',exact:true}));
const back=()=>fireEvent.click(screen.getByRole('button',{name:'Back to tables'}));
const cartItem=name=>screen.queryByText(name,{selector:'.font-medium'});

beforeEach(()=>{
  vi.restoreAllMocks();vi.clearAllMocks();localStorage.clear();sessionStorage.clear();
  localStorage.setItem('token','test-token');localStorage.setItem('user',JSON.stringify({id:1}));
  useAuth.mockReturnValue({user:{id:1}});
  api.get.mockImplementation(path=>Promise.resolve({data:path==='tables'?tables:menu}));
  api.post.mockResolvedValue({data:receipt});
});

describe('POS table ordering',()=>{
  it('opens on exactly tables 1–12 with no menu or manual table entry',async()=>{
    renderPOS();
    expect(await screen.findByRole('heading',{name:'Select a table'})).toBeVisible();
    await screen.findByRole('button',{name:'Table 12',exact:true});
    expect(screen.getAllByRole('button',{name:/^Table \d+$/})).toHaveLength(12);
    expect(screen.queryByLabelText('Table number')).not.toBeInTheDocument();
    expect(cartItem('Chicken Biryani')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('menu');
  });
  it('loads menu and categories after selecting a table',async()=>{
    renderPOS();await selectTable('12');
    expect(await screen.findByRole('button',{name:/Chicken Biryani ₹/})).toBeVisible();
    expect(screen.getByRole('heading',{name:'Table 12'})).toBeVisible();
    expect(screen.getByRole('button',{name:'Main Course'})).toBeVisible();
    expect(screen.queryByLabelText('Table number')).not.toBeInTheDocument();
  });
  it('redirects unauthenticated users without loading data',async()=>{
    localStorage.removeItem('token');renderPOS();
    await waitFor(()=>expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(toast.error).toHaveBeenCalledWith('Please login to access POS');expect(api.get).not.toHaveBeenCalled();
  });
  it('merges quantities, removes items, and disables empty checkout',async()=>{
    renderPOS();await selectTable();await addItem();await addItem();
    expect(screen.getByText('₹ 300.00')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Decrease quantity'}));
    expect(screen.getByText('₹ 150.00')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
    expect(screen.getByText('No Item Selected')).toBeVisible();expect(screen.getByRole('button',{name:'SAVE',exact:true})).toBeDisabled();
    expect(sessionStorage.getItem('pos-draft:1:table:1')).toBeNull();
  });
  it('filters by category and search including empty matches',async()=>{
    renderPOS();await selectTable();await screen.findByRole('button',{name:'Beverages'});
    fireEvent.click(screen.getByRole('button',{name:'Beverages'}));
    expect(screen.queryByRole('button',{name:/Chicken Biryani ₹/})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Coke ₹/})).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search query'),{target:{value:'missing'}});
    expect(screen.queryByRole('button',{name:/Coke ₹/})).not.toBeInTheDocument();
  });
  it.each(['Cash','Card','Due','Part'])('sends selected table automatically with optional phone for %s',async mode=>{
    renderPOS();await selectTable('8');await addItem();
    fireEvent.click(screen.getByRole('radio',{name:mode}));
    if(mode==='Part') fireEvent.change(screen.getByLabelText('Amount paid now'),{target:{value:'50'}});
    expect(screen.getByLabelText('Customer phone')).not.toBeRequired();save();
    await waitFor(()=>expect(toast.success).toHaveBeenCalledWith('Order Saved!'));
    expect(api.post).toHaveBeenCalledWith('/orders',expect.objectContaining({tableNumber:'8',type:'Dine In',paymentMode:mode,customerPhone:'',items:[expect.objectContaining({id:1,qty:1})]}),expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));
    expect(screen.getByText('No Item Selected')).toBeVisible();
    expect(sessionStorage.getItem('pos-draft:1:table:8')).toBeNull();
  });
  it('keeps cart, customer and payment details separate for each table',async()=>{
    renderPOS();await selectTable();await addItem();
    fireEvent.change(screen.getByLabelText('Customer name'),{target:{value:'Customer One'}});
    fireEvent.click(screen.getByRole('radio',{name:'Due'}));back();
    expect(screen.getByRole('button',{name:'Table 1',exact:true})).toHaveTextContent('Saved cart · 1 items');
    await selectTable('2');expect(cartItem('Chicken Biryani')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Customer name')).toHaveValue('');await addItem('Coke');back();await selectTable();
    expect(cartItem('Chicken Biryani')).toBeVisible();expect(cartItem('Coke')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Customer name')).toHaveValue('Customer One');expect(screen.getByRole('radio',{name:'Due'})).toBeChecked();
  });
  it.each(['Delivery','Pick Up'])('preserves separate %s drafts without a table',async type=>{
    renderPOS();await selectTable();await addItem();fireEvent.click(screen.getByRole('button',{name:type.toUpperCase(),exact:true}));
    expect(cartItem('Chicken Biryani')).not.toBeInTheDocument();await addItem('Coke');save();
    await waitFor(()=>expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({type,tableNumber:'',items:[{id:2,qty:1}]});
    back();await selectTable();expect(cartItem('Chicken Biryani')).toBeVisible();
  });
  it('restores selected table and the same retry after reload; changed orders get new keys',async()=>{
    api.post.mockRejectedValue(new Error('lost response'));
    const view=renderPOS();await selectTable('3');await addItem();save();
    await waitFor(()=>expect(toast.error).toHaveBeenCalledWith('Failed to save order. Retry with the same details.'));
    const first=api.post.mock.calls[0];view.unmount();renderPOS('/?table=3');
    expect(await screen.findByRole('heading',{name:'Table 3'})).toBeVisible();save();
    await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1]).toEqual(first);
    await waitFor(()=>expect(screen.getByRole('button',{name:'SAVE',exact:true})).toBeEnabled());
    await addItem();save();await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(3));
    expect(api.post.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(first[2].headers['Idempotency-Key']);
  });
  it('preserves old draft retry keys despite changed field ordering',async()=>{
    const details={customerName:'Old',customerPhone:'',tableNumber:'A7',notes:'Keep',discount:'0',amountPaid:'',partialPaymentMode:'Cash'};
    const request={items:[{...menu[0],qty:1}],type:'Dine In',paymentMode:'Due',...details};
    sessionStorage.setItem('pos-draft:1',JSON.stringify({items:request.items,type:'Dine In',paymentMode:'Due',details,request,key:'old-retry-key'}));
    renderPOS();fireEvent.click(await screen.findByRole('button',{name:'Resume previous saved order'}));
    expect(screen.getByRole('heading',{name:'Table A7'})).toBeVisible();save();
    await waitFor(()=>expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toEqual(request);expect(api.post.mock.calls[0][2].headers['Idempotency-Key']).toBe('old-retry-key');
  });
  it('uses the authenticated actor even without a local profile, and isolates accounts',async()=>{
    localStorage.removeItem('user');
    sessionStorage.setItem('pos-draft:1:table:1',JSON.stringify({items:[{...menu[0],qty:1}]}));
    useAuth.mockReturnValue({user:{id:2}});
    renderPOS();await selectTable();expect(screen.getByText('No Item Selected')).toBeVisible();
  });
  it('handles corrupt saved JSON and invalid table links without creating an order',async()=>{
    sessionStorage.setItem('pos-draft:1:table:99','invalid');renderPOS('/?table=99');
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
    expect(screen.queryByRole('button',{name:'SAVE',exact:true})).not.toBeInTheDocument();expect(api.post).not.toHaveBeenCalled();
  });
  it('shows table load failure and retries successfully',async()=>{
    api.get.mockRejectedValueOnce(new Error('network'));renderPOS();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load tables');
    fireEvent.click(screen.getByRole('button',{name:'Retry loading tables'}));
    expect(await screen.findByRole('button',{name:'Table 12',exact:true})).toBeVisible();
  });
  it('does not invent tables when all configured tables are inactive',async()=>{
    api.get.mockResolvedValue({data:[]});renderPOS();
    expect(await screen.findByText(/No dining tables are active/)).toBeVisible();
    expect(screen.queryByRole('button',{name:'Table 1',exact:true})).not.toBeInTheDocument();
  });
  it('shows menu load failure and retries successfully',async()=>{
    api.get.mockImplementation(path=>path==='tables'?Promise.resolve({data:tables}):Promise.reject(new Error('network')));
    renderPOS();await selectTable();expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load menu');
    api.get.mockResolvedValue({data:menu});fireEvent.click(screen.getByRole('button',{name:'Retry loading menu'}));
    expect(await screen.findByRole('button',{name:/Chicken Biryani ₹/})).toBeVisible();
  });
  it('locks cart, details, navigation and duplicate submission while saving',async()=>{
    let resolve;api.post.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    renderPOS();await selectTable();await addItem();save();
    expect(screen.getByRole('button',{name:'Back to tables'})).toBeDisabled();
    expect(screen.getByLabelText('Customer phone')).toBeDisabled();expect(screen.getByRole('button',{name:'Increase quantity'})).toBeDisabled();
    expect(screen.getByRole('radio',{name:'Due'})).toBeDisabled();save();expect(api.post).toHaveBeenCalledTimes(1);
    resolve({data:receipt});await waitFor(()=>expect(screen.getByText('No Item Selected')).toBeVisible());
  });
  it('prints a committed receipt and never prints after failed checkout',async()=>{
    const print=vi.spyOn(window,'print').mockImplementation(()=>{expect(document.querySelector('.pos-receipt')).toHaveTextContent('ORD-test');});
    renderPOS();await selectTable();await addItem();fireEvent.click(screen.getByRole('button',{name:'SAVE & PRINT',exact:true}));
    await waitFor(()=>expect(print).toHaveBeenCalledTimes(1));await addItem();api.post.mockRejectedValue(new Error('failure'));
    fireEvent.click(screen.getByRole('button',{name:'SAVE & PRINT',exact:true}));
    await waitFor(()=>expect(toast.error).toHaveBeenCalled());expect(print).toHaveBeenCalledTimes(1);
  });
});
