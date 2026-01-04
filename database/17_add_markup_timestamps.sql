-- Add updated_at column to markup_rules for audit trail
-- This is critical for ensuring rate changes don't affect historical calculations

ALTER TABLE markup_rules 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for efficient querying by date
CREATE INDEX IF NOT EXISTS idx_markup_rules_updated_at ON markup_rules(updated_at);

COMMENT ON COLUMN markup_rules.updated_at IS 'Tracks when the markup rule was last modified - critical for historical data integrity';
COMMENT ON COLUMN markup_rules.created_at IS 'Tracks when the markup rule was created';
