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

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class ConnectorSecretSpec extends AnyFlatSpec with Matchers {

  private val localUrl =
    "jdbc:postgresql://localhost:5432/texera_db?currentSchema=texera_db,public"
  private val loopbackUrl = "jdbc:postgresql://127.0.0.1:5432/texera_db"
  private val prodUrl = "jdbc:postgresql://texera-postgres:5432/texera_db"

  "isDevJdbcUrl" should "treat localhost and loopback JDBC URLs as local development" in {
    ConnectorSecret.isDevJdbcUrl(localUrl) shouldBe true
    ConnectorSecret.isDevJdbcUrl(loopbackUrl) shouldBe true
    ConnectorSecret.isDevJdbcUrl("jdbc:postgresql://[::1]:5432/texera_db") shouldBe true
  }

  it should "treat a remote JDBC host as non-dev" in {
    ConnectorSecret.isDevJdbcUrl(prodUrl) shouldBe false
    ConnectorSecret.isDevJdbcUrl("jdbc:postgresql://localhost.evil.example:5432/db") shouldBe false
    ConnectorSecret.isDevJdbcUrl(null) shouldBe false
  }

  "requireAtStartup" should "fail when the key is missing outside local development" in {
    val thrown = intercept[IllegalStateException] {
      ConnectorSecret.requireAtStartup(prodUrl, None)
    }
    thrown.getMessage should include("CONNECTOR_SECRET_KEY")
  }

  it should "fail when the key is blank outside local development" in {
    intercept[IllegalStateException] {
      ConnectorSecret.requireAtStartup(prodUrl, Some("   "))
    }
  }

  it should "allow a missing key against a localhost JDBC URL" in {
    noException should be thrownBy ConnectorSecret.requireAtStartup(localUrl, None)
  }

  it should "allow a configured key in production" in {
    noException should be thrownBy ConnectorSecret.requireAtStartup(prodUrl, Some("prod-secret"))
  }

  "resolveSecret" should "use the provided key when present" in {
    ConnectorSecret.resolveSecret(prodUrl, Some("  prod-secret  ")) shouldBe "prod-secret"
  }

  it should "fall back to the local-dev key when unset on localhost" in {
    ConnectorSecret.resolveSecret(localUrl, None) shouldBe ConnectorSecret.LocalDevFallbackKey
  }

  "cipher" should "round-trip with a caller-supplied key" in {
    val cipher = ConnectorSecret.cipher(prodUrl, Some("caller-key"))
    cipher.decrypt(cipher.encrypt("pw")) shouldBe "pw"
  }
}
