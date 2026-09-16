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

import com.fasterxml.jackson.databind.{JsonNode, ObjectMapper}
import com.fasterxml.jackson.module.scala.DefaultScalaModule
import org.apache.texera.amber.operator.source.sql.snowflake.SnowflakeSourceOpDesc
import org.apache.texera.common.config.{EnvironmentalVariable, StorageConfig}
import org.apache.texera.common.util.{AesGcmCipher, ConnectorSecretKey}
import org.apache.texera.dao.SqlServer
import org.jooq.impl.DSL
import org.jooq.{DSLContext, JSONB, Record}

/**
  * JDBC fields filled onto a Snowflake Source at compile/run from a saved
  * `connection_cred` row. Never written back into workflow.content.
  */
final case class SnowflakeJdbcCredentials(
    account: String,
    warehouse: String,
    database: String,
    schema: String,
    role: Option[String],
    username: String,
    password: String
)

trait SnowflakeConnectionLookup {
  def resolve(uid: Int, connectionId: String): SnowflakeJdbcCredentials
}

object SnowflakeConnectionLookup {

  val AddConnectionMessage: String = SnowflakeSourceOpDesc.AddConnectionMessage

  val InactiveConnectionMessage: String =
    "This connection is not active. Test it under Connectors."

  val SnowflakeCode: String = "snowflake"

  lazy val default: SnowflakeConnectionLookup = new SqlSnowflakeConnectionLookup()

  private val mapper = new ObjectMapper().registerModule(DefaultScalaModule)

  private[snowflake] def parseConnectionId(connectionId: String): Int = {
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

  private[snowflake] def credentialsFrom(
      configJson: String,
      password: String
  ): SnowflakeJdbcCredentials = {
    if (password == null) {
      throw new IllegalArgumentException(AddConnectionMessage)
    }
    val node = mapper.readTree(if (configJson == null) "{}" else configJson)
    SnowflakeJdbcCredentials(
      account = requiredText(node, "account"),
      warehouse = requiredText(node, "warehouse"),
      database = requiredText(node, "database"),
      schema = optionalText(node, "schema").getOrElse("PUBLIC"),
      role = optionalText(node, "role"),
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

  private def optionalText(node: JsonNode, field: String): Option[String] = {
    val value = node.get(field)
    if (value == null || value.isNull) None
    else {
      val text = value.asText().trim
      if (text.isEmpty) None else Some(text)
    }
  }
}

class SqlSnowflakeConnectionLookup(
    cipher: AesGcmCipher,
    dsl: () => DSLContext
) extends SnowflakeConnectionLookup {

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

  override def resolve(uid: Int, connectionId: String): SnowflakeJdbcCredentials = {
    val id = SnowflakeConnectionLookup.parseConnectionId(connectionId)
    val record = fetch(uid, id)
    if (record == null) {
      throw new IllegalArgumentException(SnowflakeConnectionLookup.AddConnectionMessage)
    }
    val code = record.get(SqlSnowflakeConnectionLookup.DcCode)
    if (code != SnowflakeConnectionLookup.SnowflakeCode) {
      throw new IllegalArgumentException(SnowflakeConnectionLookup.AddConnectionMessage)
    }
    val status = record.get(SqlSnowflakeConnectionLookup.CredStatus)
    if (status != "active") {
      throw new IllegalArgumentException(SnowflakeConnectionLookup.InactiveConnectionMessage)
    }
    val password = cipher.decrypt(record.get(SqlSnowflakeConnectionLookup.CredSecretEnc))
    val config = SqlSnowflakeConnectionLookup.jsonbData(
      record.get(SqlSnowflakeConnectionLookup.CredConfig)
    )
    SnowflakeConnectionLookup.credentialsFrom(config, password)
  }

  private def fetch(uid: Int, id: Int): Record = {
    val ctx = dsl()
    ctx
      .select(
        SqlSnowflakeConnectionLookup.DcCode,
        SqlSnowflakeConnectionLookup.CredStatus,
        SqlSnowflakeConnectionLookup.CredConfig,
        SqlSnowflakeConnectionLookup.CredSecretEnc
      )
      .from(SqlSnowflakeConnectionLookup.ConnectionCred)
      .join(SqlSnowflakeConnectionLookup.DataConnector)
      .on(
        SqlSnowflakeConnectionLookup.CredConnectorId.eq(SqlSnowflakeConnectionLookup.DcId)
      )
      .where(
        SqlSnowflakeConnectionLookup.CredId
          .eq(id)
          .and(SqlSnowflakeConnectionLookup.CredUid.eq(uid))
      )
      .fetchOne()
  }
}

private object SqlSnowflakeConnectionLookup {
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
