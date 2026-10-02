-- A lead's GSTIN, so a quotation can carry the buyer's tax registration
-- alongside Rollvento's own. Empty string rather than NULL to match how the
-- other optional text on leads is stored, and additive so it is safe to apply
-- to a database that is already serving traffic.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gstin varchar(20) NOT NULL DEFAULT '';
