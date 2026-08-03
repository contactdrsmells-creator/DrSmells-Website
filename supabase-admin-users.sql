-- Admin accounts with roles for the website admin panel.
--
-- Replaces a single shared ADMIN_PASSWORD, so actions can be attributed to a
-- person and each account only gets the access it needs.
--
-- Roles:
--   super_admin  full control, including managing admin users
--   designer     content and media only — never pricing, orders or settings
--   viewer       read-only, sales orders only
--
-- Passwords are scrypt hashes (salt:hash), never plain text.

CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('super_admin', 'designer', 'viewer')),
  active        BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users (lower(email));

-- Only the server (service role) touches this table; the public anon key
-- must never be able to read password hashes.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
