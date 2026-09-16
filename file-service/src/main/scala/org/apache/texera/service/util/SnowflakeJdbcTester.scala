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

import java.sql.{Connection, DriverManager, SQLException}
import java.util.Properties

/**
  * JDBC fields for a Snowflake password-only (`authenticator=snowflake`)
  * session. Password is never placed on the JDBC URL.
  */
final case class SnowflakeSession(
    account: String,
    username: String,
    password: String,
    warehouse: String,
    database: String,
    schema: String = "PUBLIC",
    role: Option[String] = None
)

trait SnowflakeSelectOne {
  def selectOne(session: SnowflakeSession): Unit
  def listTables(session: SnowflakeSession): Seq[String]
}

/**
  * Opens a Snowflake JDBC connection with [[java.sql.DriverManager.getConnection]]
  * `(url, Properties)` and runs a synchronous `SELECT 1`. Password lives in
  * the Properties object only, never as a URL query parameter.
  *
  * [[openConnection]] is injectable so unit tests can mock the driver without a
  * live Snowflake account.
  */
class SnowflakeJdbcTester(
    openConnection: (String, Properties) => Connection = SnowflakeJdbcTester.driverManagerOpen
) extends SnowflakeSelectOne {

  def selectOne(session: SnowflakeSession): Unit =
    withConnection(session) { conn =>
      val stmt = conn.createStatement()
      try {
        val rs = stmt.executeQuery("SELECT 1")
        try {
          if (!rs.next()) throw new SQLException("SELECT 1 returned no row")
        } finally rs.close()
      } finally stmt.close()
    }

  def listTables(session: SnowflakeSession): Seq[String] =
    withConnection(session) { conn =>
      val stmt = conn.createStatement()
      try {
        val rs = stmt.executeQuery(
          SnowflakeJdbcTester.showTablesSql(session.database, SnowflakeJdbcTester.schemaOrPublic(session.schema))
        )
        try {
          val names = List.newBuilder[String]
          while (rs.next()) {
            names += rs.getString("name")
          }
          names.result()
        } finally rs.close()
      } finally stmt.close()
    }

  private def withConnection[T](session: SnowflakeSession)(body: Connection => T): T = {
    val url = SnowflakeJdbcTester.buildJdbcUrl(session.account)
    val first =
      try Right(open(url, session, allowUnderscores = false))
      catch {
        case e: SQLException => Left(e)
      }
    val conn =
      first match {
        case Right(opened) => opened
        case Left(error) =>
          if (SnowflakeJdbcTester.accountHasUnderscore(session.account)) {
            try open(url, session, allowUnderscores = true)
            catch {
              case retry: SQLException => throw SnowflakeJdbcTester.mapped(retry)
            }
          } else {
            throw SnowflakeJdbcTester.mapped(error)
          }
      }
    try body(conn)
    catch {
      case e: SQLException => throw SnowflakeJdbcTester.mapped(e)
    } finally conn.close()
  }

  private def open(
      url: String,
      session: SnowflakeSession,
      allowUnderscores: Boolean
  ): Connection =
    openConnection(
      url,
      SnowflakeJdbcTester.connectionProperties(
        username = session.username,
        password = session.password,
        warehouse = session.warehouse,
        database = session.database,
        schema = session.schema,
        role = session.role,
        allowUnderscoresInHost = allowUnderscores
      )
    )
}

object SnowflakeJdbcTester {

  val DriverClass: String = "net.snowflake.client.jdbc.SnowflakeDriver"

  val MfaMessage: String =
    "Snowflake requires MFA or SSO for this user. Password-only auth is not enabled."

  private val SnowflakeHostSuffix = ".snowflakecomputing.com"

  def buildJdbcUrl(account: String): String =
    s"jdbc:snowflake://${accountHost(account)}/"

  def connectionProperties(
      username: String,
      password: String,
      warehouse: String,
      database: String,
      schema: String,
      role: Option[String],
      allowUnderscoresInHost: Boolean = false
  ): Properties = {
    val props = new Properties()
    props.setProperty("user", username)
    props.setProperty("password", password)
    props.setProperty("warehouse", warehouse)
    props.setProperty("db", database)
    props.setProperty("schema", schemaOrPublic(schema))
    trimmed(role).foreach(value => props.setProperty("role", value))
    props.setProperty("application", "Bottega")
    props.setProperty("authenticator", "snowflake")
    if (allowUnderscoresInHost) {
      props.setProperty("allowUnderscoresInHost", "true")
    }
    props
  }

  def showTablesSql(database: String, schema: String): String =
    s"""SHOW TABLES IN SCHEMA ${quoteIdent(database)}.${quoteIdent(schema)}"""

  def schemaOrPublic(schema: String): String = {
    val trimmedSchema = Option(schema).map(_.trim).getOrElse("")
    if (trimmedSchema.isEmpty) "PUBLIC" else trimmedSchema
  }

  def accountHasUnderscore(account: String): Boolean =
    accountHost(account).contains('_')

  def mapped(error: SQLException): SQLException =
    if (isMfaOrSso(error)) new SQLException(MfaMessage, error)
    else error

  def isMfaOrSso(error: Throwable): Boolean = {
    val combined = Iterator
      .iterate(error)(_.getCause)
      .takeWhile(_ != null)
      .map(e => Option(e.getMessage).getOrElse(""))
      .mkString(" ")
      .toLowerCase
    combined.contains("mfa") ||
    combined.contains("duo") ||
    combined.contains("externalbrowser") ||
    combined.contains("multi-factor") ||
    combined.contains("multifactor")
  }

  private[util] def driverManagerOpen(url: String, props: Properties): Connection = {
    Class.forName(DriverClass)
    DriverManager.getConnection(url, props)
  }

  private def accountHost(account: String): String = {
    val trimmedAccount = Option(account).map(_.trim).getOrElse("")
    val withoutScheme = trimmedAccount.replaceFirst("(?i)^https?://", "")
    val withoutPath = withoutScheme.replaceFirst("/+$", "")
    if (withoutPath.toLowerCase.endsWith(SnowflakeHostSuffix)) withoutPath
    else withoutPath + SnowflakeHostSuffix
  }

  private def quoteIdent(name: String): String =
    "\"" + name.replace("\"", "\"\"") + "\""

  private def trimmed(value: Option[String]): Option[String] =
    value.map(_.trim).filter(_.nonEmpty)
}
