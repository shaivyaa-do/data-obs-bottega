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

package org.apache.texera.common.compiler.postgres

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class PostgresConnectionLookupSpec extends AnyFlatSpec with Matchers {

  "parseConnectionId" should "parse a numeric id" in {
    PostgresConnectionLookup.parseConnectionId("7") shouldBe 7
    PostgresConnectionLookup.parseConnectionId(" 12 ") shouldBe 12
  }

  it should "reject a missing or non-numeric id" in {
    intercept[IllegalArgumentException] {
      PostgresConnectionLookup.parseConnectionId("")
    }.getMessage shouldBe PostgresConnectionLookup.AddConnectionMessage
    intercept[IllegalArgumentException] {
      PostgresConnectionLookup.parseConnectionId("facilities-prod")
    }.getMessage shouldBe PostgresConnectionLookup.AddConnectionMessage
    intercept[IllegalArgumentException] {
      PostgresConnectionLookup.parseConnectionId(null)
    }.getMessage shouldBe PostgresConnectionLookup.AddConnectionMessage
  }

  "credentialsFrom" should "read host, port, database, username, and the decrypted password" in {
    val creds = PostgresConnectionLookup.credentialsFrom(
      """{"host":"db.internal","port":5433,"database":"analytics","username":"analyst","schema":"public"}""",
      "hunter2"
    )
    creds.host shouldBe "db.internal"
    creds.port shouldBe "5433"
    creds.database shouldBe "analytics"
    creds.username shouldBe "analyst"
    creds.password shouldBe "hunter2"
  }

  it should "default a missing port to 5432" in {
    val creds = PostgresConnectionLookup.credentialsFrom(
      """{"host":"localhost","database":"texera","username":"postgres"}""",
      "pw"
    )
    creds.port shouldBe "5432"
  }

  it should "reject a config that is missing host" in {
    intercept[IllegalArgumentException] {
      PostgresConnectionLookup.credentialsFrom(
        """{"port":5432,"database":"texera","username":"postgres"}""",
        "pw"
      )
    }.getMessage shouldBe PostgresConnectionLookup.AddConnectionMessage
  }

  it should "reject a null password" in {
    intercept[IllegalArgumentException] {
      PostgresConnectionLookup.credentialsFrom(
        """{"host":"localhost","database":"texera","username":"postgres"}""",
        null
      )
    }.getMessage shouldBe PostgresConnectionLookup.AddConnectionMessage
  }
}
