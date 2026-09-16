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

package org.apache.texera.service.util

import org.apache.texera.common.config.{EnvironmentalVariable, StorageConfig}
import org.apache.texera.common.util.{AesGcmCipher, ConnectorSecretKey}

/**
  * Loads [[EnvironmentalVariable.ENV_CONNECTOR_SECRET_KEY]] for AES-GCM of
  * `connection_cred.secret_enc`. Missing in local-dev (localhost JDBC) falls
  * back to a well-known string; missing anywhere else fails startup.
  */
object ConnectorSecret {

  private[util] val LocalDevFallbackKey = ConnectorSecretKey.LocalDevFallbackKey

  def isDevJdbcUrl(jdbcUrl: String): Boolean =
    ConnectorSecretKey.isDevJdbcUrl(jdbcUrl)

  def requireAtStartup(jdbcUrl: String, key: Option[String]): Unit =
    ConnectorSecretKey.requireAtStartup(jdbcUrl, key)

  def resolveSecret(jdbcUrl: String, key: Option[String]): String =
    ConnectorSecretKey.resolveSecret(jdbcUrl, key)

  def cipher(
      jdbcUrl: String = StorageConfig.jdbcUrl,
      key: Option[String] = EnvironmentalVariable.get(
        EnvironmentalVariable.ENV_CONNECTOR_SECRET_KEY
      )
  ): AesGcmCipher =
    new AesGcmCipher(AesGcmCipher.keyFromSecret(resolveSecret(jdbcUrl, key)))
}
