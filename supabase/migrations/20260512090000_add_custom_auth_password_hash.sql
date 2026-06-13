-- Store hashes for BizManager's custom JWT authentication.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (lower(email));
