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

package org.apache.texera.common.compiler.mysql

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class MysqlConnectionLookupSpec extends AnyFlatSpec with Matchers {

  "parseConnectionId" should "parse a numeric id" in {
    MysqlConnectionLookup.parseConnectionId("7") shouldBe 7
    MysqlConnectionLookup.parseConnectionId(" 12 ") shouldBe 12
  }

  it should "reject a missing or non-numeric id" in {
    intercept[IllegalArgumentException] {
      MysqlConnectionLookup.parseConnectionId("")
    }.getMessage shouldBe MysqlConnectionLookup.AddConnectionMessage
    intercept[IllegalArgumentException] {
      MysqlConnectionLookup.parseConnectionId("orders")
    }.getMessage shouldBe MysqlConnectionLookup.AddConnectionMessage
    intercept[IllegalArgumentException] {
      MysqlConnectionLookup.parseConnectionId(null)
    }.getMessage shouldBe MysqlConnectionLookup.AddConnectionMessage
  }

  "credentialsFrom" should "read host, port, database, username, and the decrypted password" in {
    val creds = MysqlConnectionLookup.credentialsFrom(
      """{"host":"db.internal","port":3307,"database":"analytics","username":"analyst"}""",
      "hunter2"
    )
    creds.host shouldBe "db.internal"
    creds.port shouldBe "3307"
    creds.database shouldBe "analytics"
    creds.username shouldBe "analyst"
    creds.password shouldBe "hunter2"
  }

  it should "default a missing port to 3306" in {
    val creds = MysqlConnectionLookup.credentialsFrom(
      """{"host":"localhost","database":"app","username":"mysql"}""",
      "pw"
    )
    creds.port shouldBe "3306"
  }

  it should "reject a config that is missing host" in {
    intercept[IllegalArgumentException] {
      MysqlConnectionLookup.credentialsFrom(
        """{"port":3306,"database":"app","username":"mysql"}""",
        "pw"
      )
    }.getMessage shouldBe MysqlConnectionLookup.AddConnectionMessage
  }

  it should "reject a null password" in {
    intercept[IllegalArgumentException] {
      MysqlConnectionLookup.credentialsFrom(
        """{"host":"localhost","database":"app","username":"mysql"}""",
        null
      )
    }.getMessage shouldBe MysqlConnectionLookup.AddConnectionMessage
  }
}
