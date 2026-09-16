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

import java.sql.{Connection, DriverManager, SQLException}
import java.util.Properties

/**
  * Opens a Snowflake JDBC connection with [[java.sql.DriverManager.getConnection]]
  * `(url, Properties)`. Password lives in the Properties object only, never as a
  * URL query parameter.
  *
  * [[openConnection]] is injectable so unit tests can mock the driver without a
  * live Snowflake account.
  */
object SnowflakeConnUtil {

  val DriverClass: String = "net.snowflake.client.jdbc.SnowflakeDriver"

  val MfaMessage: String =
    "Snowflake requires MFA or SSO for this user. Password-only auth is not enabled."

  private val SnowflakeHostSuffix = ".snowflakecomputing.com"

  @volatile
  private[snowflake] var openConnection: (String, Properties) => Connection = defaultOpen

  private[snowflake] def driverManagerOpen: (String, Properties) => Connection = defaultOpen

  private def defaultOpen(url: String, props: Properties): Connection = {
    Class.forName(DriverClass)
    DriverManager.getConnection(url, props)
  }

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

  def qualifiedTable(schema: String, table: String): String =
    s"${quoteIdent(schemaOrPublic(schema))}.${quoteIdent(table)}"

  def schemaOrPublic(schema: String): String = {
    val trimmedSchema = Option(schema).map(_.trim).getOrElse("")
    if (trimmedSchema.isEmpty) "PUBLIC" else trimmedSchema
  }

  def quoteIdent(name: String): String =
    "\"" + Option(name).getOrElse("").replace("\"", "\"\"") + "\""

  @throws[SQLException]
  def connect(
      account: String,
      warehouse: String,
      database: String,
      schema: String,
      role: Option[String],
      username: String,
      password: String
  ): Connection = {
    val url = buildJdbcUrl(account)
    val first =
      try Right(open(url, username, password, warehouse, database, schema, role, allowUnderscores = false))
      catch {
        case e: SQLException => Left(e)
      }
    val conn =
      first match {
        case Right(opened) => opened
        case Left(error) =>
          if (accountHasUnderscore(account)) {
            try open(url, username, password, warehouse, database, schema, role, allowUnderscores = true)
            catch {
              case retry: SQLException => throw mapped(retry)
            }
          } else {
            throw mapped(error)
          }
      }
    conn.setReadOnly(true)
    conn
  }

  private def open(
      url: String,
      username: String,
      password: String,
      warehouse: String,
      database: String,
      schema: String,
      role: Option[String],
      allowUnderscores: Boolean
  ): Connection =
    openConnection(
      url,
      connectionProperties(
        username = username,
        password = password,
        warehouse = warehouse,
        database = database,
        schema = schema,
        role = role,
        allowUnderscoresInHost = allowUnderscores
      )
    )

  private def accountHasUnderscore(account: String): Boolean =
    accountHost(account).contains('_')

  private def mapped(error: SQLException): SQLException =
    if (isMfaOrSso(error)) new SQLException(MfaMessage, error)
    else error

  private def isMfaOrSso(error: Throwable): Boolean = {
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

  private def accountHost(account: String): String = {
    val trimmedAccount = Option(account).map(_.trim).getOrElse("")
    val withoutScheme = trimmedAccount.replaceFirst("(?i)^https?://", "")
    val withoutPath = withoutScheme.replaceFirst("/+$", "")
    if (withoutPath.toLowerCase.endsWith(SnowflakeHostSuffix)) withoutPath
    else withoutPath + SnowflakeHostSuffix
  }

  private def trimmed(value: Option[String]): Option[String] =
    value.map(_.trim).filter(_.nonEmpty)
}
