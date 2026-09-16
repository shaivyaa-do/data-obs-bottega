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

import { describe, expect, test } from "bun:test";
import { parseJdbcUrl } from "./jdbc-url";

describe("parseJdbcUrl", () => {
  test("reads host, port, database and schema from the Texera JDBC URL", () => {
    expect(
      parseJdbcUrl(
        "jdbc:postgresql://localhost:5432/texera_db?currentSchema=texera_db,public",
        "texera",
        "password"
      )
    ).toEqual({
      hostname: "localhost",
      port: 5432,
      database: "texera_db",
      username: "texera",
      password: "password",
      searchPath: "texera_db, public",
    });
  });

  test("rejects a non-postgres JDBC URL", () => {
    expect(() => parseJdbcUrl("jdbc:mysql://localhost/db", "u", "p")).toThrow(/jdbc:postgresql/);
  });

  test("rejects a URL with no database name", () => {
    expect(() => parseJdbcUrl("jdbc:postgresql://localhost:5432", "u", "p")).toThrow(/database name/);
  });
});
