/**
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

export interface PostgresConnection {
  hostname: string;
  port: number;
  database: string;
  username: string;
  password: string;
  searchPath: string;
}

const JDBC_PREFIX = "jdbc:postgresql://";

/**
 * Turns the JDBC URL the Scala services already use into a Bun SQL connection.
 * currentSchema=texera_db,public becomes search_path; credentials stay out of the URL.
 */
export function parseJdbcUrl(jdbcUrl: string, username: string, password: string): PostgresConnection {
  if (!jdbcUrl.startsWith(JDBC_PREFIX)) {
    throw new Error("STORAGE_JDBC_URL must be a jdbc:postgresql:// URL");
  }
  const withoutPrefix = jdbcUrl.slice(JDBC_PREFIX.length);
  const [hostDb, query = ""] = withoutPrefix.split("?");
  const slash = hostDb.indexOf("/");
  if (slash < 0) {
    throw new Error("STORAGE_JDBC_URL is missing a database name");
  }
  const hostPort = hostDb.slice(0, slash);
  const database = hostDb.slice(slash + 1);
  const colon = hostPort.lastIndexOf(":");
  const hostname = colon >= 0 ? hostPort.slice(0, colon) : hostPort;
  const port = colon >= 0 ? Number(hostPort.slice(colon + 1)) : 5432;
  const params = new URLSearchParams(query);
  const searchPath = params.get("currentSchema")?.replace(/,/g, ", ") ?? "texera_db, public";
  return { hostname, port, database, username, password, searchPath };
}
