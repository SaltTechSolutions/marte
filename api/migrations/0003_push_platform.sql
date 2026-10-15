ALTER TABLE push_tokens ADD COLUMN platform TEXT CHECK (platform IN ('ios','android'));
