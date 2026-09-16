/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

\c texera_db

SET search_path TO texera_db;

BEGIN;

-- Catalog of JDBC connector types (not a user's login). Passwords never live here.
-- User-saved connections go in connection_cred; PostgreSQL Source will take a
-- connection_id in a follow-up so workflow.content does not store secrets.
CREATE TABLE IF NOT EXISTS data_connector
(
    id                SERIAL PRIMARY KEY,
    code              VARCHAR(64)  NOT NULL UNIQUE,
    display_name      VARCHAR(128) NOT NULL,
    fields_schema     JSONB        NOT NULL,
    jdbc_url_template TEXT         NOT NULL,
    driver_class      VARCHAR(256),
    is_enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One row = one user's saved connection. config is non-secrets only;
-- the password is encrypted in secret_enc and is never copied into config.
CREATE TABLE IF NOT EXISTS connection_cred
(
    id             SERIAL PRIMARY KEY,
    connector_id   INT          NOT NULL,
    uid            INT          NOT NULL,
    name           VARCHAR(128) NOT NULL,
    status         VARCHAR(32)  NOT NULL DEFAULT 'active',
    config         JSONB        NOT NULL,
    secret_enc     BYTEA        NOT NULL,
    last_tested_at TIMESTAMPTZ,
    last_error     TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (uid, name),
    FOREIGN KEY (connector_id) REFERENCES data_connector(id),
    FOREIGN KEY (uid) REFERENCES "user"(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connection_audit
(
    id            SERIAL PRIMARY KEY,
    connection_id INT,
    uid           INT,
    action        VARCHAR(64) NOT NULL,
    detail        JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (connection_id) REFERENCES connection_cred(id) ON DELETE SET NULL,
    FOREIGN KEY (uid) REFERENCES "user"(uid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_connection_cred_uid ON connection_cred (uid);
CREATE INDEX IF NOT EXISTS idx_connection_audit_connection_id ON connection_audit (connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_audit_created_at ON connection_audit (created_at);

INSERT INTO data_connector (code, display_name, fields_schema, jdbc_url_template, driver_class)
VALUES (
    'postgres',
    'PostgreSQL',
    '{
      "fields": [
        {"name":"host","label":"Host","type":"string","required":true},
        {"name":"port","label":"Port","type":"string","required":true,"default":"5432"},
        {"name":"database","label":"Database","type":"string","required":true},
        {"name":"username","label":"Username","type":"string","required":true},
        {"name":"password","label":"Password","type":"password","required":true,"secret":true},
        {"name":"schema","label":"Schema","type":"string","required":false,"default":"public"}
      ]
    }'::jsonb,
    'jdbc:postgresql://{host}:{port}/{database}',
    'org.postgresql.Driver'
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
