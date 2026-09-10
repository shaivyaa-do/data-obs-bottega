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

/** Forwarded to access-control-service, which injects it as LiteLLM's provider `api_key`. */
export const LLM_PROVIDER_API_KEY_HEADER = "X-LLM-Provider-Api-Key";

export interface LlmGatewayClientOptions {
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
}

/**
 * Credentials for the OpenAI-compatible client that talks to the Texera LLM
 * gateway. The JWT authenticates the user; an optional provider key is sent in
 * a dedicated header so the gateway can attach it to the LiteLLM body
 * without replacing the JWT.
 */
export function llmGatewayClientOptions(
  modelsEndpoint: string,
  userToken: string,
  providerApiKey?: string
): LlmGatewayClientOptions {
  const trimmed = providerApiKey?.trim();
  return {
    baseURL: `${modelsEndpoint}/api`,
    apiKey: userToken,
    ...(trimmed ? { headers: { [LLM_PROVIDER_API_KEY_HEADER]: trimmed } } : {}),
  };
}
