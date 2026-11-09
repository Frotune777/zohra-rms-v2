const {DomainError,finite,statusFor}=require('../src/utils/domain');
const LedgerLine=require('../src/modules/finance/entities/LedgerLine');
const JournalEntry=require('../src/modules/finance/entities/JournalEntry');
const valuation=require('../src/modules/inventory/valuation');

describe('Domain validation: money boundaries and HTTP classification',()=>{
  test.each([0,0.01,'12.34',Number.MAX_SAFE_INTEGER])('accepts finite non-negative amount %p',value=>expect(finite(value,'Amount')).toBe(Number(value)));
  test.each([null,undefined,'',NaN,Infinity,-Infinity,-.01,'not numeric'])('rejects invalid amount %p with a domain error',value=>expect(()=>finite(value,'Amount')).toThrow(DomainError));
  test('positive and minimum contracts reject boundaries while preserving signed values when permitted',()=>{
    expect(()=>finite(0,'Amount',{positive:true})).toThrow('positive');expect(()=>finite(9,'Amount',{min:10})).toThrow();expect(finite(-5,'Adjustment',{min:-Infinity})).toBe(-5);
  });
  test.each([['23503',409],['23505',400],['23514',400],['22P02',400],['22003',400],['22007',400],['22008',400],['unrecognized',500]])('classifies PostgreSQL %s as %i', (code,status)=>expect(statusFor({code,message:'database failure'})).toBe(status));
  test('explicit domain status and period locks take precedence; other failures remain500',()=>{
    expect(statusFor(new DomainError('Missing',404))).toBe(404);expect(statusFor(new DomainError('Conflict',409))).toBe(409);expect(statusFor(new DomainError('Invalid'))).toBe(400);
    expect(statusFor(new Error('Financial period is locked'))).toBe(400);expect(statusFor(new Error('Locked financial period'))).toBe(400);expect(statusFor(new Error('Unexpected dependency failure'))).toBe(500);
  });
});
describe('Journal entities reject invalid postings and conserve rounded cents',()=>{
  const entry=patch=>new JournalEntry({date:'2026-11-09',description:'Receipt',reference_id:7,reference_type:'Jest',lines:[{account_code:1000,debit:10},{account_code:4000,credit:10}],...patch});
  test('prebuilt and raw lines form a balanced journal with signed line amounts',()=>{
    const debit=new LedgerLine({account_code:1000,debit:'10.005'}),credit=new LedgerLine({account_code:4000,credit:10.01});const result=entry({lines:[debit,credit]});
    expect(result.lines[0]).toBe(debit);expect(debit.amount).toBe(10.01);expect(credit.amount).toBe(-10.01);expect(result.totalAmount).toBe(10.01);expect(result.reference_id).toBe(7);
    expect(entry({reference_id:undefined,reference_type:undefined}).reference_id).toBeNull();
  });
  test.each([{account_code:null,debit:1},{account_code:1000,debit:-.001},{account_code:1000,credit:-1},{account_code:1000,debit:NaN},{account_code:1000,credit:Infinity},{account_code:1000,debit:'bad'},{account_code:1000,debit:1,credit:1},{account_code:1000},{account_code:1000,debit:.001}])('invalid ledger line %p is rejected',line=>expect(()=>new LedgerLine(line)).toThrow());
  test.each([{date:null},{date:'invalid'},{description:''},{lines:[]},{lines:[{account_code:1000,debit:1}]},{lines:[{account_code:1000,debit:1},{account_code:'1000',credit:1}]},{lines:[{account_code:1000,debit:1},{account_code:4000,credit:1.01}]}])('invalid journal %p never becomes a domain entity',patch=>expect(()=>entry(patch)).toThrow());
  test('a split journal reconciles cents across three distinct lines',()=>expect(entry({lines:[{account_code:1000,debit:.1},{account_code:1010,debit:.2},{account_code:4000,credit:.3}]}).totalAmount).toBeCloseTo(.3,12));
});
describe('Inventory carrying value: final-cent depletion and invalid quantity boundaries',()=>{
  const item={id:1,stock_qty:'0.0300',stock_value:'0.02',unit_cost:'0.67'};
  test('uses recorded book value and consumes all residual cents on final depletion',()=>{
    expect(valuation.outgoing(item,.01)).toBe(.01);expect(valuation.outgoing(item,.03)).toBe(.02);expect(valuation.valueOf({...item,stock_value:null})).toBe(.02);
    expect(valuation.quantity(.123456)).toBe(.1235);expect(valuation.money(1.005)).toBe(1.01);
  });
  test.each([0,-1,null,undefined,'',NaN,Infinity,.000001,.031])('outgoing quantity %p cannot consume stock',qty=>expect(()=>valuation.outgoing(item,qty)).toThrow(DomainError));
});
