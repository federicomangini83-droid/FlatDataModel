CREATE TABLE IF NOT EXISTS csv_files(id TEXT PRIMARY KEY,object_key TEXT NOT NULL UNIQUE,file_name TEXT NOT NULL,record_count INTEGER NOT NULL DEFAULT 0,size_bytes INTEGER NOT NULL,content_type TEXT NOT NULL DEFAULT 'text/csv; charset=utf-8',created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_csv_created ON csv_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csv_name ON csv_files(file_name);
