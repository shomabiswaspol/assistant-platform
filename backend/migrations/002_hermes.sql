-- Hermes page (admin-only, full-capability agent) — deliberately NOT
-- reusing chat_sessions/chat_messages: v1 is one continuous conversation
-- per admin, not a multi-session switcher, and the transport (host
-- subprocess via hermes-runner.service) is fundamentally different from
-- the OmniRoute tool-calling chat path.

CREATE TABLE IF NOT EXISTS hermes_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,          -- 'user', 'assistant'
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks Hermes's own auto-generated session id per admin (format like
-- "20260802_215222_0ecf80") so hermes-runner.service can --resume the
-- same underlying Hermes conversation across separate HTTP requests.
CREATE TABLE IF NOT EXISTS hermes_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    hermes_session_id VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hermes_messages_user ON hermes_messages(user_id, created_at);
