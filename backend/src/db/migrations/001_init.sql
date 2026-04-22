CREATE TABLE IF NOT EXISTS presets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom        VARCHAR(100) NOT NULL,
    seed       INTEGER NOT NULL,
    params     JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
