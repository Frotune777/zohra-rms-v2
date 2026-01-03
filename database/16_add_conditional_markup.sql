-- Add conditional markup columns to markup_rules
ALTER TABLE markup_rules ADD COLUMN IF NOT EXISTS threshold_val NUMERIC(10, 2);
ALTER TABLE markup_rules ADD COLUMN IF NOT EXISTS threshold_op VARCHAR(5) DEFAULT '>';
ALTER TABLE markup_rules ADD COLUMN IF NOT EXISTS threshold_markup_op VARCHAR(5);
ALTER TABLE markup_rules ADD COLUMN IF NOT EXISTS threshold_markup_val NUMERIC(10, 2);
