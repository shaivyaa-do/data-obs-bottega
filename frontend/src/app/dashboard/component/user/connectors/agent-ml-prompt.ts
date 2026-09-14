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

export function buildAgentMlPrompt(tableNames: string[]): string {
  const names = tableNames.length > 0 ? tableNames.join(", ") : "(none selected)";
  return (
    `These tables are connected: ${names}. Infer grain, keys, time columns. ` +
    `Tell me: (1) can we answer with SQL/aggregates only, or do we need ML? ` +
    `(2) If ML, which family: forecast, anomaly, classification, clustering? ` +
    `(3) What target and features? Do not train yet.`
  );
}
