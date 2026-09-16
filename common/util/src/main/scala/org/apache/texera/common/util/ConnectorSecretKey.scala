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

package org.apache.texera.common.util

/**
  * Resolves [[org.apache.texera.common.config.EnvironmentalVariable.ENV_CONNECTOR_SECRET_KEY]]
  * for AES-GCM of `connection_cred.secret_enc`. Shared by file-service (encrypt on save)
  * and the compiler (decrypt on compile/run) so both use the same local-dev fallback.
  */
object ConnectorSecretKey {

  val LocalDevFallbackKey = "texera-local-dev-connector-secret"

  private val LocalJdbcHost =
    """jdbc:[^:]+://(localhost|127\.0\.0\.1|\[::1\])[:/]""".r.unanchored

  def isDevJdbcUrl(jdbcUrl: String): Boolean =
    jdbcUrl != null && LocalJdbcHost.findFirstIn(jdbcUrl).isDefined

  def requireAtStartup(jdbcUrl: String, key: Option[String]): Unit = {
    val present = key.exists(_.trim.nonEmpty)
    if (!present && !isDevJdbcUrl(jdbcUrl)) {
      throw new IllegalStateException(
        "CONNECTOR_SECRET_KEY must be set outside local development"
      )
    }
  }

  def resolveSecret(jdbcUrl: String, key: Option[String]): String = {
    requireAtStartup(jdbcUrl, key)
    key.map(_.trim).filter(_.nonEmpty).getOrElse(LocalDevFallbackKey)
  }
}
