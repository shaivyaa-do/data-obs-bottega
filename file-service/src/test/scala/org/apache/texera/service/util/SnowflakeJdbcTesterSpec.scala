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

import org.scalamock.scalatest.MockFactory
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

import java.sql.{Connection, ResultSet, SQLException, Statement}
import java.util.Properties
import java.util.concurrent.atomic.AtomicInteger

class SnowflakeJdbcTesterSpec extends AnyFlatSpec with Matchers with MockFactory {

  private val secret = "p@ss-never-in-url"
  private val session = SnowflakeSession(
    account = "xy12345.us-east-1",
    username = "analyst",
    password = secret,
    warehouse = "COMPUTE_WH",
    database = "ANALYTICS",
    schema = "PUBLIC",
    role = Some("SYSADMIN")
  )

  "buildJdbcUrl" should "use the account host only and omit credentials, host fields, and port 5432" in {
    val url = SnowflakeJdbcTester.buildJdbcUrl("xy12345.us-east-1")
    url shouldBe "jdbc:snowflake://xy12345.us-east-1.snowflakecomputing.com/"
    url.toLowerCase should not include "password"
    url.toLowerCase should not include "user="
    url should not include "5432"
  }

  it should "not put the password into the URL even when the account looks like one" in {
    val url = SnowflakeJdbcTester.buildJdbcUrl("secret")
    url shouldBe "jdbc:snowflake://secret.snowflakecomputing.com/"
    url should not include "password"
  }

  it should "not double-append the Snowflake domain when the account already includes it" in {
    SnowflakeJdbcTester.buildJdbcUrl("xy12345.snowflakecomputing.com") shouldBe
      "jdbc:snowflake://xy12345.snowflakecomputing.com/"
  }

  "connectionProperties" should "set user, password, warehouse, db, schema, application, and snowflake authenticator" in {
    val props = SnowflakeJdbcTester.connectionProperties(
      username = "analyst",
      password = secret,
      warehouse = "COMPUTE_WH",
      database = "ANALYTICS",
      schema = "PUBLIC",
      role = Some("SYSADMIN")
    )
    props.getProperty("user") shouldBe "analyst"
    props.getProperty("password") shouldBe secret
    props.getProperty("warehouse") shouldBe "COMPUTE_WH"
    props.getProperty("db") shouldBe "ANALYTICS"
    props.getProperty("schema") shouldBe "PUBLIC"
    props.getProperty("role") shouldBe "SYSADMIN"
    props.getProperty("application") shouldBe "Bottega"
    props.getProperty("authenticator") shouldBe "snowflake"
    props.getProperty("allowUnderscoresInHost") shouldBe null
  }

  it should "omit a blank role and default a blank schema to PUBLIC" in {
    val props = SnowflakeJdbcTester.connectionProperties(
      username = "analyst",
      password = secret,
      warehouse = "COMPUTE_WH",
      database = "ANALYTICS",
      schema = "  ",
      role = Some("  ")
    )
    props.getProperty("schema") shouldBe "PUBLIC"
    props.containsKey("role") shouldBe false
  }

  "showTablesSql" should "quote database and schema identifiers" in {
    SnowflakeJdbcTester.showTablesSql("ANALYTICS", "PUBLIC") shouldBe
      """SHOW TABLES IN SCHEMA "ANALYTICS"."PUBLIC""""
  }

  "the Snowflake JDBC driver" should "load from the classpath without a live account" in {
    noException should be thrownBy Class.forName(SnowflakeJdbcTester.DriverClass)
  }

  "selectOne" should "open with Properties, run SELECT 1, and close statement and connection" in {
    val stmt = mock[Statement]
    val rs = mock[ResultSet]
    val conn = mock[Connection]
    (conn.createStatement: () => Statement).expects().returning(stmt)
    (stmt.executeQuery _).expects("SELECT 1").returning(rs)
    (rs.next _).expects().returning(true)
    (rs.close _).expects()
    (stmt.close _).expects()
    (conn.close _).expects()

    var seenUrl = ""
    var seenProps: Properties = null
    val tester = new SnowflakeJdbcTester((url, props) => {
      seenUrl = url
      seenProps = props
      conn
    })
    tester.selectOne(session)
    seenUrl shouldBe "jdbc:snowflake://xy12345.us-east-1.snowflakecomputing.com/"
    seenUrl should not include secret
    seenProps.getProperty("password") shouldBe secret
    seenProps.getProperty("authenticator") shouldBe "snowflake"
  }

  it should "retry once with allowUnderscoresInHost when the account contains underscores" in {
    val attempts = new AtomicInteger(0)
    val tester = new SnowflakeJdbcTester((_, props) => {
      val n = attempts.incrementAndGet()
      if (props.getProperty("allowUnderscoresInHost") != "true") {
        throw new SQLException(s"unresolved host attempt $n")
      }
      succeedingConnection()
    })
    tester.selectOne(session.copy(account = "org_name"))
    attempts.get shouldBe 2
  }

  it should "not retry when the account has no underscore" in {
    val attempts = new AtomicInteger(0)
    val tester = new SnowflakeJdbcTester((_, _) => {
      attempts.incrementAndGet()
      throw new SQLException("network down")
    })
    intercept[SQLException] {
      tester.selectOne(session.copy(account = "xy12345"))
    }.getMessage shouldBe "network down"
    attempts.get shouldBe 1
  }

  it should "map MFA, Duo, EXTERNALBROWSER, and multi-factor failures to the password-only message" in {
    val messages = Seq(
      "MFA authentication is required",
      "Duo push sent",
      "authenticator EXTERNALBROWSER is required",
      "multi-factor authentication enrolled"
    )
    messages.foreach { raw =>
      val tester = new SnowflakeJdbcTester((_, _) => throw new SQLException(raw))
      val thrown = intercept[SQLException](tester.selectOne(session))
      thrown.getMessage shouldBe SnowflakeJdbcTester.MfaMessage
      thrown.getMessage should not include raw
    }
  }

  it should "close the connection when SELECT 1 fails" in {
    val stmt = mock[Statement]
    val conn = mock[Connection]
    (conn.createStatement: () => Statement).expects().returning(stmt)
    (stmt.executeQuery _).expects("SELECT 1").throwing(new SQLException("query failed"))
    (stmt.close _).expects()
    (conn.close _).expects()
    val tester = new SnowflakeJdbcTester((_, _) => conn)
    intercept[SQLException](tester.selectOne(session)).getMessage shouldBe "query failed"
  }

  "listTables" should "run SHOW TABLES IN SCHEMA with quoted identifiers and return names" in {
    val stmt = mock[Statement]
    val rs = mock[ResultSet]
    val conn = mock[Connection]
    (conn.createStatement: () => Statement).expects().returning(stmt)
    (stmt.executeQuery _)
      .expects("""SHOW TABLES IN SCHEMA "ANALYTICS"."PUBLIC"""")
      .returning(rs)
    inSequence {
      (rs.next _).expects().returning(true)
      (rs.next _).expects().returning(true)
      (rs.next _).expects().returning(false)
    }
    inSequence {
      (rs.getString(_: String)).expects("name").returning("BUILDINGS")
      (rs.getString(_: String)).expects("name").returning("SITES")
    }
    (rs.close _).expects()
    (stmt.close _).expects()
    (conn.close _).expects()

    val tester = new SnowflakeJdbcTester((_, _) => conn)
    tester.listTables(session) shouldBe Seq("BUILDINGS", "SITES")
  }

  private def succeedingConnection(): Connection = {
    val stmt = mock[Statement]
    val rs = mock[ResultSet]
    val conn = mock[Connection]
    (conn.createStatement: () => Statement).expects().returning(stmt)
    (stmt.executeQuery _).expects("SELECT 1").returning(rs)
    (rs.next _).expects().returning(true)
    (rs.close _).expects()
    (stmt.close _).expects()
    (conn.close _).expects()
    conn
  }
}
