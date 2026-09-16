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

package org.apache.texera.common.compiler.snowflake

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class SnowflakeConnectionLookupSpec extends AnyFlatSpec with Matchers {

  "parseConnectionId" should "parse a numeric id" in {
    SnowflakeConnectionLookup.parseConnectionId("11") shouldBe 11
    SnowflakeConnectionLookup.parseConnectionId(" 12 ") shouldBe 12
  }

  it should "reject a missing or non-numeric id" in {
    intercept[IllegalArgumentException] {
      SnowflakeConnectionLookup.parseConnectionId("")
    }.getMessage shouldBe SnowflakeConnectionLookup.AddConnectionMessage
    intercept[IllegalArgumentException] {
      SnowflakeConnectionLookup.parseConnectionId("orders")
    }.getMessage shouldBe SnowflakeConnectionLookup.AddConnectionMessage
    intercept[IllegalArgumentException] {
      SnowflakeConnectionLookup.parseConnectionId(null)
    }.getMessage shouldBe SnowflakeConnectionLookup.AddConnectionMessage
  }

  "credentialsFrom" should
    "read account, warehouse, database, schema, role, username, and the decrypted password" in {
    val creds = SnowflakeConnectionLookup.credentialsFrom(
      """{"account":"xy12345.us-east-1","warehouse":"COMPUTE_WH","database":"ANALYTICS","schema":"RAW","role":"SYSADMIN","username":"analyst"}""",
      "hunter2"
    )
    creds.account shouldBe "xy12345.us-east-1"
    creds.warehouse shouldBe "COMPUTE_WH"
    creds.database shouldBe "ANALYTICS"
    creds.schema shouldBe "RAW"
    creds.role shouldBe Some("SYSADMIN")
    creds.username shouldBe "analyst"
    creds.password shouldBe "hunter2"
  }

  it should "default a missing schema to PUBLIC and omit a blank role" in {
    val creds = SnowflakeConnectionLookup.credentialsFrom(
      """{"account":"xy12345","warehouse":"WH","database":"DB","username":"u"}""",
      "pw"
    )
    creds.schema shouldBe "PUBLIC"
    creds.role shouldBe None
  }

  it should "reject a config that is missing account" in {
    intercept[IllegalArgumentException] {
      SnowflakeConnectionLookup.credentialsFrom(
        """{"warehouse":"WH","database":"DB","username":"u"}""",
        "pw"
      )
    }.getMessage shouldBe SnowflakeConnectionLookup.AddConnectionMessage
  }

  it should "reject a null password" in {
    intercept[IllegalArgumentException] {
      SnowflakeConnectionLookup.credentialsFrom(
        """{"account":"xy12345","warehouse":"WH","database":"DB","username":"u"}""",
        null
      )
    }.getMessage shouldBe SnowflakeConnectionLookup.AddConnectionMessage
  }
}
