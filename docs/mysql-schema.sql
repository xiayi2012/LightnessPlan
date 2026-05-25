CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  account VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(24) NOT NULL,
  start_weight DECIMAL(6,2) NOT NULL,
  target_weight DECIMAL(6,2) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_user_id (user_id),
  INDEX idx_sessions_expires_at (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE weight_records (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  record_date DATE NOT NULL,
  weight DECIMAL(6,2) NOT NULL,
  mood VARCHAR(16) DEFAULT '',
  note VARCHAR(120) DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uniq_user_record_date (user_id, record_date),
  INDEX idx_weight_records_date (record_date),
  INDEX idx_weight_records_user_date (user_id, record_date),
  CONSTRAINT fk_weight_records_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
