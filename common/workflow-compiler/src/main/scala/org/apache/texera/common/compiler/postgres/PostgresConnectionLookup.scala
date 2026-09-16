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

import com.fasterxml.jackson.databind.{JsonNode, ObjectMapper}
import com.fasterxml.jackson.module.scala.DefaultScalaModule
import org.apache.texera.amber.operator.source.sql.postgresql.PostgreSQLSourceOpDesc
import org.apache.texera.common.config.{EnvironmentalVariable, StorageConfig}
import org.apache.texera.common.util.{AesGcmCipher, ConnectorSecretKey}
import org.apache.texera.dao.SqlServer
import org.jooq.impl.DSL
import org.jooq.{DSLContext, JSONB, Record}

/**
  * JDBC fields filled onto a PostgreSQL Source at compile/run from a saved
  * `connection_cred` row. Never written back into workflow.content.
  */
final case class PostgresJdbcCredentials(
    host: String,
    port: String,
    database: String,
    username: String,
    password: String
)

trait PostgresConnectionLookup {
  def resolve(uid: Int, connectionId: String): PostgresJdbcCredentials
}

object PostgresConnectionLookup {

  val AddConnectionMessage: String = PostgreSQLSourceOpDesc.AddConnectionMessage

  val InactiveConnectionMessage: String =
    "This connection is not active. Test it under Connectors."

  val PostgresCode: String = "postgres"

  lazy val default: PostgresConnectionLookup = new SqlPostgresConnectionLookup()

  private val mapper = new ObjectMapper().registerModule(DefaultScalaModule)

  private[postgres] def parseConnectionId(connectionId: String): Int = {
    val trimmed = Option(connectionId).map(_.trim).getOrElse("")
    if (trimmed.isEmpty) {
      throw new IllegalArgumentException(AddConnectionMessage)
    }
    try trimmed.toInt
    catch {
      case _: NumberFormatException =>
        throw new IllegalArgumentException(AddConnectionMessage)
    }
  }

  private[postgres] def credentialsFrom(
      configJson: String,
      password: String
  ): PostgresJdbcCredentials = {
    if (password == null) {
      throw new IllegalArgumentException(AddConnectionMessage)
    }
    val node = mapper.readTree(if (configJson == null) "{}" else configJson)
    PostgresJdbcCredentials(
      host = requiredText(node, "host"),
      port = portText(node),
      database = requiredText(node, "database"),
      username = requiredText(node, "username"),
      password = password
    )
  }

  private def requiredText(node: JsonNode, field: String): String = {
    val value = node.get(field)
    if (value == null || value.isNull || value.asText().trim.isEmpty) {
      throw new IllegalArgumentException(AddConnectionMessage)
    }
    value.asText().trim
  }

  private def portText(node: JsonNode): String = {
    val value = node.get("port")
    if (value == null || value.isNull) {
      "5432"
    } else if (value.isNumber) {
      value.asInt().toString
    } else {
      val text = value.asText().trim
      if (text.isEmpty) "5432" else text
    }
  }
}

class SqlPostgresConnectionLookup(
    cipher: AesGcmCipher,
    dsl: () => DSLContext
) extends PostgresConnectionLookup {

  def this() = {
    this(
      new AesGcmCipher(
        AesGcmCipher.keyFromSecret(
          ConnectorSecretKey.resolveSecret(
            StorageConfig.jdbcUrl,
            EnvironmentalVariable.get(EnvironmentalVariable.ENV_CONNECTOR_SECRET_KEY)
          )
        )
      ),
      () => SqlServer.getInstance().createDSLContext()
    )
  }

  override def resolve(uid: Int, connectionId: String): PostgresJdbcCredentials = {
    val id = PostgresConnectionLookup.parseConnectionId(connectionId)
    val record = fetch(uid, id)
    if (record == null) {
      throw new IllegalArgumentException(PostgresConnectionLookup.AddConnectionMessage)
    }
    val code = record.get(SqlPostgresConnectionLookup.DcCode)
    if (code != PostgresConnectionLookup.PostgresCode) {
      throw new IllegalArgumentException(PostgresConnectionLookup.AddConnectionMessage)
    }
    val status = record.get(SqlPostgresConnectionLookup.CredStatus)
    if (status != "active") {
      throw new IllegalArgumentException(PostgresConnectionLookup.InactiveConnectionMessage)
    }
    val password = cipher.decrypt(record.get(SqlPostgresConnectionLookup.CredSecretEnc))
    val config = SqlPostgresConnectionLookup.jsonbData(
      record.get(SqlPostgresConnectionLookup.CredConfig)
    )
    PostgresConnectionLookup.credentialsFrom(config, password)
  }

  private def fetch(uid: Int, id: Int): Record = {
    val ctx = dsl()
    ctx
      .select(
        SqlPostgresConnectionLookup.DcCode,
        SqlPostgresConnectionLookup.CredStatus,
        SqlPostgresConnectionLookup.CredConfig,
        SqlPostgresConnectionLookup.CredSecretEnc
      )
      .from(SqlPostgresConnectionLookup.ConnectionCred)
      .join(SqlPostgresConnectionLookup.DataConnector)
      .on(
        SqlPostgresConnectionLookup.CredConnectorId.eq(SqlPostgresConnectionLookup.DcId)
      )
      .where(
        SqlPostgresConnectionLookup.CredId
          .eq(id)
          .and(SqlPostgresConnectionLookup.CredUid.eq(uid))
      )
      .fetchOne()
  }
}

private object SqlPostgresConnectionLookup {
  private val Schema = "texera_db"

  private def table(name: String) = DSL.table(DSL.name(Schema, name))
  private def col[T](tableName: String, column: String, tpe: Class[T]) =
    DSL.field(DSL.name(Schema, tableName, column), tpe)

  val DataConnector = table("data_connector")
  val ConnectionCred = table("connection_cred")

  val DcId = col("data_connector", "id", classOf[Integer])
  val DcCode = col("data_connector", "code", classOf[String])

  val CredId = col("connection_cred", "id", classOf[Integer])
  val CredConnectorId = col("connection_cred", "connector_id", classOf[Integer])
  val CredUid = col("connection_cred", "uid", classOf[Integer])
  val CredStatus = col("connection_cred", "status", classOf[String])
  val CredConfig = col("connection_cred", "config", classOf[JSONB])
  val CredSecretEnc = col("connection_cred", "secret_enc", classOf[Array[Byte]])

  def jsonbData(value: Any): String =
    value match {
      case null      => "{}"
      case j: JSONB  => j.data()
      case s: String => s
      case other     => other.toString
    }
}
