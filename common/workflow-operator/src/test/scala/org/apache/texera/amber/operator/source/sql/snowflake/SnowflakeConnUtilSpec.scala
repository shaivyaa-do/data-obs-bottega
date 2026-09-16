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

package org.apache.texera.amber.operator.source.sql.snowflake

import org.scalamock.scalatest.MockFactory
import org.scalatest.BeforeAndAfter
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

import java.sql.{Connection, SQLException}
import java.util.Properties

class SnowflakeConnUtilSpec extends AnyFlatSpec with Matchers with MockFactory with BeforeAndAfter {

  after {
    SnowflakeConnUtil.openConnection = SnowflakeConnUtil.driverManagerOpen
  }

  "SnowflakeConnUtil.buildJdbcUrl" should "build jdbc:snowflake://{account}.snowflakecomputing.com/" in {
    SnowflakeConnUtil.buildJdbcUrl("xy12345.us-east-1") shouldBe
      "jdbc:snowflake://xy12345.us-east-1.snowflakecomputing.com/"
  }

  it should "not put the password on the URL" in {
    val url = SnowflakeConnUtil.buildJdbcUrl("xy12345.us-east-1")
    url should not include "password"
    url should not include "hunter2"
  }

  it should "leave a host that already ends with .snowflakecomputing.com unchanged" in {
    SnowflakeConnUtil.buildJdbcUrl("xy12345.snowflakecomputing.com") shouldBe
      "jdbc:snowflake://xy12345.snowflakecomputing.com/"
  }

  "SnowflakeConnUtil.connectionProperties" should
    "set user, password, warehouse, db, schema, application, and snowflake authenticator" in {
    val props = SnowflakeConnUtil.connectionProperties(
      username = "analyst",
      password = "hunter2",
      warehouse = "COMPUTE_WH",
      database = "ANALYTICS",
      schema = "PUBLIC",
      role = Some("SYSADMIN")
    )
    props.getProperty("user") shouldBe "analyst"
    props.getProperty("password") shouldBe "hunter2"
    props.getProperty("warehouse") shouldBe "COMPUTE_WH"
    props.getProperty("db") shouldBe "ANALYTICS"
    props.getProperty("schema") shouldBe "PUBLIC"
    props.getProperty("role") shouldBe "SYSADMIN"
    props.getProperty("application") shouldBe "Bottega"
    props.getProperty("authenticator") shouldBe "snowflake"
  }

  it should "omit a blank role" in {
    val props = SnowflakeConnUtil.connectionProperties(
      username = "u",
      password = "p",
      warehouse = "WH",
      database = "DB",
      schema = "",
      role = Some("  ")
    )
    props.getProperty("schema") shouldBe "PUBLIC"
    props.containsKey("role") shouldBe false
  }

  "SnowflakeConnUtil.showTablesSql" should "quote database and schema identifiers" in {
    SnowflakeConnUtil.showTablesSql("ANALYTICS", "PUBLIC") shouldBe
      """SHOW TABLES IN SCHEMA "ANALYTICS"."PUBLIC""""
  }

  "SnowflakeConnUtil.qualifiedTable" should "quote schema and table" in {
    SnowflakeConnUtil.qualifiedTable("PUBLIC", "ORDERS") shouldBe """"PUBLIC"."ORDERS""""
  }

  "SnowflakeConnUtil.connect" should "open with Properties, never a password query param, and set read-only" in {
    val conn = mock[Connection]
    var seenUrl = ""
    var seenProps: Properties = null
    SnowflakeConnUtil.openConnection = (url, props) => {
      seenUrl = url
      seenProps = props
      conn
    }
    (conn.setReadOnly _).expects(true)

    SnowflakeConnUtil.connect(
      account = "xy12345.us-east-1",
      warehouse = "COMPUTE_WH",
      database = "ANALYTICS",
      schema = "PUBLIC",
      role = Some("SYSADMIN"),
      username = "analyst",
      password = "hunter2"
    ) should be theSameInstanceAs conn

    seenUrl shouldBe "jdbc:snowflake://xy12345.us-east-1.snowflakecomputing.com/"
    seenUrl should not include "hunter2"
    seenProps.getProperty("password") shouldBe "hunter2"
    seenProps.getProperty("authenticator") shouldBe "snowflake"
  }

  it should "retry once with allowUnderscoresInHost when the account contains an underscore" in {
    val conn = mock[Connection]
    var attempts = 0
    SnowflakeConnUtil.openConnection = (_, props) => {
      attempts += 1
      if (attempts == 1) {
        props.getProperty("allowUnderscoresInHost") shouldBe null
        throw new SQLException("JDBC driver encountered communication error")
      }
      props.getProperty("allowUnderscoresInHost") shouldBe "true"
      conn
    }
    (conn.setReadOnly _).expects(true)

    SnowflakeConnUtil.connect(
      account = "org_account",
      warehouse = "WH",
      database = "DB",
      schema = "PUBLIC",
      role = None,
      username = "u",
      password = "p"
    ) should be theSameInstanceAs conn
    attempts shouldBe 2
  }

  it should "map MFA/SSO SQLExceptions to the password-only message" in {
    SnowflakeConnUtil.openConnection = (_, _) =>
      throw new SQLException("Duo MFA is required for this user")
    intercept[SQLException] {
      SnowflakeConnUtil.connect(
        account = "xy12345",
        warehouse = "WH",
        database = "DB",
        schema = "PUBLIC",
        role = None,
        username = "u",
        password = "p"
      )
    }.getMessage shouldBe SnowflakeConnUtil.MfaMessage
  }
}
