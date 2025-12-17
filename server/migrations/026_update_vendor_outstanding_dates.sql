-- Update vendor_outstanding view to include date tracking for payment delay calculations

DROP VIEW IF EXISTS vendor_outstanding;

CREATE OR REPLACE VIEW vendor_outstanding AS
SELECT 
    s.id as vendor_id,
    s.name as vendor_name,
    s.vendor_type,
    s.category_id,
    vc.name as category_name,
    COALESCE(s.opening_balance, 0) + 
    COALESCE(SUM(CASE 
        WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.amount
        WHEN vl.transaction_type = 'Payment' THEN -vl.amount
        ELSE 0 
    END), 0) as outstanding_balance,
    COUNT(CASE WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN 1 END) as total_bills,
    COUNT(CASE WHEN vl.transaction_type = 'Payment' THEN 1 END) as total_payments,
    MAX(vl.date) as last_transaction_date,
    -- New fields for payment delay tracking
    MIN(CASE WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.date END) as oldest_bill_date,
    MAX(CASE WHEN vl.transaction_type = 'Payment' THEN vl.date END) as last_payment_date,
    -- Days since oldest unpaid bill (for vendors with outstanding balance)
    CASE 
        WHEN COALESCE(s.opening_balance, 0) + 
            COALESCE(SUM(CASE 
                WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.amount
                WHEN vl.transaction_type = 'Payment' THEN -vl.amount
                ELSE 0 
            END), 0) > 0 
        THEN CURRENT_DATE - MIN(CASE WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.date END)
        ELSE NULL
    END as days_outstanding
FROM suppliers s
LEFT JOIN vendor_ledger vl ON s.id = vl.supplier_id
LEFT JOIN vendor_categories vc ON s.category_id = vc.id
GROUP BY s.id, s.name, s.vendor_type, s.category_id, vc.name, s.opening_balance;
