-- Profile photos are gone (decision of 18 Oct 2026). A member picks one of 12 predefined avatars instead;
-- the id is validated against src/avatars.ts. photo_url stays in the table (SQLite cannot drop it cheaply)
-- but nothing reads or writes it any more and the data migration leaves it NULL.
ALTER TABLE memberships ADD COLUMN avatar_id TEXT;
