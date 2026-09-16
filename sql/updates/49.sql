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

-- Configured Texera agents. The agent-service hydrates these rows into memory on
-- GET /agents after a restart. Provider API keys are never stored: LLM calls go
-- through the LiteLLM gateway with the listing user's JWT.
CREATE TABLE IF NOT EXISTS user_agent
(
    agent_id           VARCHAR(64)  NOT NULL PRIMARY KEY,
    uid                INT          NOT NULL,
    name               VARCHAR(256) NOT NULL,
    model_type         VARCHAR(128) NOT NULL,
    settings           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    workflow_id        INT,
    computing_unit_id  INT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    FOREIGN KEY (uid) REFERENCES "user"(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_agent_uid ON user_agent (uid);

COMMIT;
