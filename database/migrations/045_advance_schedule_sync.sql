BEGIN;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS advance_request_id INTEGER REFERENCES advance_requests(id);
UPDATE salary_advances s SET advance_request_id=a.advance_request_id FROM advance_ledger a WHERE a.salary_advance_id=s.id AND a.transaction_type='Advance' AND a.advance_request_id IS NOT NULL AND s.advance_request_id IS NULL;
ALTER TABLE advance_repayment_schedule ADD COLUMN IF NOT EXISTS recovered_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE advance_repayment_schedule ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Partial','Paid'));
CREATE TABLE advance_schedule_allocations (
 id BIGSERIAL PRIMARY KEY, schedule_id INTEGER NOT NULL REFERENCES advance_repayment_schedule(id),
 journal_entry_id UUID NOT NULL REFERENCES journal_entries(id), amount NUMERIC(10,2) NOT NULL CHECK(amount>0), reversed BOOLEAN NOT NULL DEFAULT FALSE
);
COMMIT;
