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
import { LLM_PROVIDER_API_KEY_HEADER, llmGatewayClientOptions } from "./llm-client";

describe("llmGatewayClientOptions", () => {
  test("always sends the user JWT as the gateway apiKey", () => {
    const opts = llmGatewayClientOptions("http://localhost:9096", "jwt-token");
    expect(opts.apiKey).toBe("jwt-token");
    expect(opts.baseURL).toBe("http://localhost:9096/api");
    expect(opts.headers).toBeUndefined();
  });

  test("attaches a trimmed provider key as a dedicated header", () => {
    const opts = llmGatewayClientOptions("http://localhost:9096", "jwt-token", "  sk-ant-secret  ");
    expect(opts.apiKey).toBe("jwt-token");
    expect(opts.headers).toEqual({ [LLM_PROVIDER_API_KEY_HEADER]: "sk-ant-secret" });
  });

  test("omits the header when the provider key is blank", () => {
    expect(llmGatewayClientOptions("http://localhost:9096", "jwt-token", "   ").headers).toBeUndefined();
    expect(llmGatewayClientOptions("http://localhost:9096", "jwt-token", "").headers).toBeUndefined();
  });
});
