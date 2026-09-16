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

package org.apache.texera.service.resource

import com.fasterxml.jackson.databind.{JsonNode, ObjectMapper}
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.scala.DefaultScalaModule
import com.typesafe.scalalogging.LazyLogging
import io.dropwizard.auth.Auth
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs._
import jakarta.ws.rs.core.MediaType
import org.apache.texera.auth.SessionUser
import org.apache.texera.common.util.AesGcmCipher
import org.apache.texera.dao.SqlServer
import org.apache.texera.dao.SqlServer.withTransaction
import org.apache.texera.dao.SqlStates
import org.apache.texera.service.resource.ConnectorResource._
import org.apache.texera.service.util.{
  ConnectorSecret,
  JdbcListTables,
  JdbcSelectOne,
  MysqlJdbcTester,
  PostgresJdbcTester
}
import org.jooq.exception.DataAccessException
import org.jooq.impl.DSL
import org.jooq.{DSLContext, JSONB, Record}

import java.sql.Timestamp
import java.time.{Instant, OffsetDateTime}
import scala.jdk.CollectionConverters._
import scala.util.control.NonFatal

object ConnectorResource {
  val PostgresCode = "postgres"
  val MysqlCode = "mysql"
  private val SupportedCodes = Set(PostgresCode, MysqlCode)

  case class ConnectorTypeResponse(
      id: Int,
      code: String,
      displayName: String,
      fieldsSchema: JsonNode
  )

  case class SavedConnectorResponse(
      id: Int,
      name: String,
      status: String,
      connectorCode: String,
      connectorDisplayName: String,
      config: Map[String, Any],
      lastTestedAt: Option[String],
      lastError: Option[String]
  )

  case class CreateConnectorRequest(
      name: String,
      connectorCode: String,
      host: String,
      port: Any,
      database: String,
      username: String,
      schema: Option[String] = None,
      password: String
  )

  case class PatchConnectorRequest(
      name: Option[String] = None,
      host: Option[String] = None,
      port: Option[Any] = None,
      database: Option[String] = None,
      username: Option[String] = None,
      schema: Option[String] = None,
      password: Option[String] = None
  )

  private val mapper = new ObjectMapper().registerModule(DefaultScalaModule)

  private val Schema = "texera_db"

  private def table(name: String) = DSL.table(DSL.name(Schema, name))
  private def col[T](tableName: String, column: String, tpe: Class[T]) =
    DSL.field(DSL.name(Schema, tableName, column), tpe)

  private val DataConnector = table("data_connector")
  private val ConnectionCred = table("connection_cred")
  private val ConnectionAudit = table("connection_audit")

  private val DcId = col("data_connector", "id", classOf[Integer])
  private val DcCode = col("data_connector", "code", classOf[String])
  private val DcDisplayName = col("data_connector", "display_name", classOf[String])
  private val DcFieldsSchema = col("data_connector", "fields_schema", classOf[JSONB])
  private val DcEnabled = col("data_connector", "is_enabled", classOf[java.lang.Boolean])

  private val CredId = col("connection_cred", "id", classOf[Integer])
  private val CredConnectorId = col("connection_cred", "connector_id", classOf[Integer])
  private val CredUid = col("connection_cred", "uid", classOf[Integer])
  private val CredName = col("connection_cred", "name", classOf[String])
  private val CredStatus = col("connection_cred", "status", classOf[String])
  private val CredConfig = col("connection_cred", "config", classOf[JSONB])
  private val CredSecretEnc = col("connection_cred", "secret_enc", classOf[Array[Byte]])
  private val CredLastTestedAt = col("connection_cred", "last_tested_at", classOf[Timestamp])
  private val CredLastError = col("connection_cred", "last_error", classOf[String])
  private val CredUpdatedAt = col("connection_cred", "updated_at", classOf[Timestamp])

  private val AuditConnectionId = col("connection_audit", "connection_id", classOf[Integer])
  private val AuditUid = col("connection_audit", "uid", classOf[Integer])
  private val AuditAction = col("connection_audit", "action", classOf[String])
  private val AuditDetail = col("connection_audit", "detail", classOf[JSONB])

  private val SecretConfigKeys = Set("password", "secret", "secret_enc")

  private def context: DSLContext =
    SqlServer.getInstance().createDSLContext()

  private[resource] def parsePort(value: Any, defaultPort: Int = 5432): Int = {
    val n = value match {
      case null                        => defaultPort
      case n: java.lang.Number         => n.intValue()
      case s: String if s.trim.isEmpty => defaultPort
      case s: String =>
        try s.trim.toInt
        catch {
          case _: NumberFormatException =>
            throw new BadRequestException("port must be a number")
        }
      case other =>
        throw new BadRequestException(s"port must be a number, got ${other.getClass.getName}")
    }
    if (n < 1 || n > 65535) {
      throw new BadRequestException("port must be between 1 and 65535")
    }
    n
  }

  private def requireNonEmpty(value: String, field: String): String = {
    if (value == null || value.trim.isEmpty) {
      throw new BadRequestException(s"$field is required")
    }
    value.trim
  }

  private def optionalTrimmed(value: Option[String]): Option[String] =
    value.map(_.trim).filter(_.nonEmpty)

  private def jsonbData(value: Any): String =
    value match {
      case null      => "{}"
      case j: JSONB  => j.data()
      case s: String => s
      case other     => other.toString
    }

  private def publicConfig(raw: String): Map[String, Any] = {
    val node = mapper.readTree(raw)
    val asMap =
      mapper.convertValue(node, classOf[java.util.Map[String, Object]]).asScala.toMap
    asMap.collect {
      case (k, v) if !SecretConfigKeys.contains(k.toLowerCase) => k -> (v: Any)
    }
  }

  private def configObject(
      host: String,
      port: Int,
      database: String,
      username: String,
      schema: Option[String]
  ): ObjectNode = {
    val node = mapper.createObjectNode()
    node.put("host", host)
    node.put("port", port)
    node.put("database", database)
    node.put("username", username)
    schema.foreach(s => node.put("schema", s))
    node
  }

  private def toIso(value: Any): Option[String] =
    value match {
      case null              => None
      case t: OffsetDateTime => Some(t.toString)
      case t: Instant        => Some(t.toString)
      case t: Timestamp      => Some(t.toInstant.toString)
      case other             => Some(other.toString)
    }

  private def toResponse(record: Record): SavedConnectorResponse = {
    SavedConnectorResponse(
      id = record.get(CredId).intValue(),
      name = record.get(CredName),
      status = record.get(CredStatus),
      connectorCode = record.get(DcCode),
      connectorDisplayName = record.get(DcDisplayName),
      config = publicConfig(jsonbData(record.get(CredConfig))),
      lastTestedAt = toIso(record.get(CredLastTestedAt)),
      lastError = Option(record.get(CredLastError))
    )
  }

  private def assertNoSecret(payload: Any, password: String): Unit = {
    val json = mapper.writeValueAsString(payload)
    if (password != null && password.nonEmpty && json.contains(password)) {
      throw new IllegalStateException("response leaked a connector password")
    }
    if (json.contains("secret_enc")) {
      throw new IllegalStateException("response leaked secret_enc")
    }
  }

  private def safeJdbcMessage(error: Throwable, password: String, code: String): String = {
    val raw = Option(error.getMessage).getOrElse(error.getClass.getSimpleName)
    val stripped = raw.replaceAll("(?i)password=[^\\s;]*", "password=***")
    val noSecret =
      if (password != null && password.nonEmpty) stripped.replace(password, "***")
      else stripped
    s"Could not connect to ${productName(code)}: $noSecret"
  }

  private def productName(code: String): String =
    code match {
      case MysqlCode => "MySQL"
      case _         => "PostgreSQL"
    }

  private def defaultPortFor(code: String): Int =
    if (code == MysqlCode) 3306 else 5432

  private def jdbcUrl(code: String, host: String, port: Int, database: String): String =
    code match {
      case MysqlCode => MysqlJdbcTester.buildJdbcUrl(host, port, database)
      case _         => PostgresJdbcTester.buildJdbcUrl(host, port, database)
    }

  private def writeAudit(
      ctx: DSLContext,
      connectionId: Integer,
      uid: Integer,
      action: String,
      detail: JsonNode
  ): Unit = {
    val json = mapper.writeValueAsString(detail)
    if (json.toLowerCase.contains("\"password\"") || json.contains("secret_enc")) {
      throw new IllegalStateException("audit.detail must not include secrets")
    }
    ctx
      .insertInto(ConnectionAudit)
      .set(AuditConnectionId, connectionId)
      .set(AuditUid, uid)
      .set(AuditAction, action)
      .set(AuditDetail, JSONB.valueOf(json))
      .execute()
  }
}

@Produces(Array(MediaType.APPLICATION_JSON))
@Consumes(Array(MediaType.APPLICATION_JSON))
@RolesAllowed(Array("REGULAR", "ADMIN"))
@Path("/connectors")
class ConnectorResource(
    cipher: AesGcmCipher,
    testers: Map[String, JdbcSelectOne with JdbcListTables]
) extends LazyLogging {

  def this(cipher: AesGcmCipher, postgres: JdbcSelectOne with JdbcListTables) =
    this(cipher, Map(PostgresCode -> postgres, MysqlCode -> MysqlJdbcTester))

  def this() =
    this(
      ConnectorSecret.cipher(),
      Map(PostgresCode -> PostgresJdbcTester, MysqlCode -> MysqlJdbcTester)
    )

  private def clientFor(code: String): JdbcSelectOne with JdbcListTables =
    testers.getOrElse(
      code,
      throw new BadRequestException("Unsupported connector type")
    )

  @GET
  @Path("/types")
  def listTypes(@Auth user: SessionUser): Seq[ConnectorTypeResponse] = {
    context
      .select(DcId, DcCode, DcDisplayName, DcFieldsSchema)
      .from(DataConnector)
      .where(DcEnabled.isTrue)
      .orderBy(DcCode.asc())
      .fetch()
      .asScala
      .toSeq
      .map { record =>
        ConnectorTypeResponse(
          id = record.get(DcId).intValue(),
          code = record.get(DcCode),
          displayName = record.get(DcDisplayName),
          fieldsSchema = mapper.readTree(jsonbData(record.get(DcFieldsSchema)))
        )
      }
  }

  @GET
  def listConnectors(@Auth user: SessionUser): Seq[SavedConnectorResponse] = {
    val rows = loadOwned(context, user.getUid, None)
    rows.foreach(r => assertNoSecret(r, null))
    rows
  }

  @POST
  def createConnector(
      request: CreateConnectorRequest,
      @Auth user: SessionUser
  ): SavedConnectorResponse = {
    if (request == null) throw new BadRequestException("body is required")
    val name = requireNonEmpty(request.name, "name")
    val code = requireNonEmpty(request.connectorCode, "connectorCode").toLowerCase
    if (!SupportedCodes.contains(code)) {
      throw new BadRequestException("Unsupported connector type")
    }
    val host = requireNonEmpty(request.host, "host")
    val port = parsePort(request.port, defaultPortFor(code))
    val database = requireNonEmpty(request.database, "database")
    val username = requireNonEmpty(request.username, "username")
    if (request.password == null) {
      throw new BadRequestException("password is required")
    }
    val schema = optionalTrimmed(request.schema)
    val config = configObject(host, port, database, username, schema)
    val secretEnc = cipher.encrypt(request.password)

    val created = withTransaction(context) { ctx =>
      val connectorId = enabledConnectorId(ctx, code)
      val id =
        try {
          ctx
            .insertInto(ConnectionCred)
            .set(CredConnectorId, connectorId)
            .set(CredUid, user.getUid)
            .set(CredName, name)
            .set(CredStatus, "active")
            .set(CredConfig, JSONB.valueOf(mapper.writeValueAsString(config)))
            .set(CredSecretEnc, secretEnc)
            .returning(CredId)
            .fetchOne()
            .get(CredId)
        } catch {
          case e: DataAccessException if e.sqlState() == SqlStates.UNIQUE_VIOLATION =>
            throw new WebApplicationException("A connector with this name already exists", 409)
        }
      val detail = mapper.createObjectNode()
      detail.put("name", name)
      detail.put("connector", code)
      writeAudit(ctx, id, user.getUid, "create", detail)
      loadOwned(ctx, user.getUid, Some(id)).head
    }
    assertNoSecret(created, request.password)
    created
  }

  @GET
  @Path("/{id}/tables")
  def listTables(
      @PathParam("id") id: Integer,
      @Auth user: SessionUser
  ): Seq[String] = {
    val record = ownedRecord(context, user.getUid, id)
    if (record.get(CredStatus) != "active") {
      throw new BadRequestException("Connector must be active to list tables")
    }
    val code = record.get(DcCode)
    val config = publicConfig(jsonbData(record.get(CredConfig)))
    val host = config.getOrElse("host", "").toString
    val port = parsePort(config.getOrElse("port", defaultPortFor(code)), defaultPortFor(code))
    val database = config.getOrElse("database", "").toString
    val username = config.getOrElse("username", "").toString
    val schema = config
      .get("schema")
      .map(_.toString)
      .flatMap(value => optionalTrimmed(Some(value)))
      .getOrElse(if (code == MysqlCode) database else "public")
    val password = cipher.decrypt(record.get(CredSecretEnc))
    val url = jdbcUrl(code, host, port, database)
    try {
      val names = clientFor(code).listTables(url, username, password, schema)
      assertNoSecret(names, password)
      names
    } catch {
      case e: BadRequestException => throw e
      case NonFatal(e) =>
        logger.warn(s"List tables failed for connection $id: ${e.getClass.getSimpleName}")
        throw new BadRequestException(safeJdbcMessage(e, password, code))
    }
  }

  @POST
  @Path("/{id}/test")
  def testConnector(
      @PathParam("id") id: Integer,
      @Auth user: SessionUser
  ): SavedConnectorResponse = {
    val outcome = withTransaction(context) { ctx =>
      val record = ownedRecord(ctx, user.getUid, id)
      val code = record.get(DcCode)
      val config = publicConfig(jsonbData(record.get(CredConfig)))
      val host = config.getOrElse("host", "").toString
      val port = parsePort(config.getOrElse("port", defaultPortFor(code)), defaultPortFor(code))
      val database = config.getOrElse("database", "").toString
      val username = config.getOrElse("username", "").toString
      val password = cipher.decrypt(record.get(CredSecretEnc))
      val url = jdbcUrl(code, host, port, database)
      try {
        clientFor(code).selectOne(url, username, password)
        ctx
          .update(ConnectionCred)
          .set(CredStatus, "active")
          .set(CredLastTestedAt, Timestamp.from(Instant.now()))
          .setNull(CredLastError)
          .set(CredUpdatedAt, Timestamp.from(Instant.now()))
          .where(CredId.eq(id).and(CredUid.eq(user.getUid)))
          .execute()
        writeAudit(ctx, id, user.getUid, "test", mapper.createObjectNode())
        Right(loadOwned(ctx, user.getUid, Some(id)).head)
      } catch {
        case NonFatal(e) =>
          val message = safeJdbcMessage(e, password, code)
          logger.warn(s"JDBC test failed for connection $id: ${e.getClass.getSimpleName}")
          ctx
            .update(ConnectionCred)
            .set(CredStatus, "error")
            .set(CredLastError, message)
            .set(CredUpdatedAt, Timestamp.from(Instant.now()))
            .where(CredId.eq(id).and(CredUid.eq(user.getUid)))
            .execute()
          val detail = mapper.createObjectNode()
          detail.put("message", message)
          writeAudit(ctx, id, user.getUid, "test_fail", detail)
          Left(message)
      }
    }
    outcome match {
      case Left(message) =>
        throw new BadRequestException(message)
      case Right(row) =>
        row
    }
  }

  @PATCH
  @Path("/{id}")
  def patchConnector(
      @PathParam("id") id: Integer,
      request: PatchConnectorRequest,
      @Auth user: SessionUser
  ): SavedConnectorResponse = {
    if (request == null) throw new BadRequestException("body is required")
    val patched = withTransaction(context) { ctx =>
      val record = ownedRecord(ctx, user.getUid, id)
      val current = publicConfig(jsonbData(record.get(CredConfig)))
      val nextName = optionalTrimmed(request.name).getOrElse(record.get(CredName))
      val host = request.host.map(requireNonEmpty(_, "host")).getOrElse {
        current.getOrElse("host", "").toString
      }
      val code = record.get(DcCode)
      val port = request.port
        .map(parsePort(_, defaultPortFor(code)))
        .getOrElse(parsePort(current.getOrElse("port", defaultPortFor(code)), defaultPortFor(code)))
      val database = request.database.map(requireNonEmpty(_, "database")).getOrElse {
        current.getOrElse("database", "").toString
      }
      val username = request.username.map(requireNonEmpty(_, "username")).getOrElse {
        current.getOrElse("username", "").toString
      }
      val schema = request.schema match {
        case Some(s) => optionalTrimmed(Some(s))
        case None    => current.get("schema").map(_.toString).flatMap(v => optionalTrimmed(Some(v)))
      }
      val config = configObject(host, port, database, username, schema)
      var update = ctx
        .update(ConnectionCred)
        .set(CredName, nextName)
        .set(CredConfig, JSONB.valueOf(mapper.writeValueAsString(config)))
        .set(CredUpdatedAt, Timestamp.from(Instant.now()))
      request.password.foreach { password =>
        if (password == null) throw new BadRequestException("password is required")
        update = update.set(CredSecretEnc, cipher.encrypt(password))
      }
      try {
        update.where(CredId.eq(id).and(CredUid.eq(user.getUid))).execute()
      } catch {
        case e: DataAccessException if e.sqlState() == SqlStates.UNIQUE_VIOLATION =>
          throw new WebApplicationException("A connector with this name already exists", 409)
      }
      writeAudit(ctx, id, user.getUid, "update", mapper.createObjectNode().put("name", nextName))
      loadOwned(ctx, user.getUid, Some(id)).head
    }
    request.password.foreach(pw => assertNoSecret(patched, pw))
    patched
  }

  @DELETE
  @Path("/{id}")
  def deleteConnector(
      @PathParam("id") id: Integer,
      @Auth user: SessionUser
  ): Unit = {
    withTransaction(context) { ctx =>
      ownedRecord(ctx, user.getUid, id)
      writeAudit(ctx, id, user.getUid, "delete", mapper.createObjectNode())
      ctx
        .deleteFrom(ConnectionCred)
        .where(CredId.eq(id).and(CredUid.eq(user.getUid)))
        .execute()
    }
  }

  private def enabledConnectorId(ctx: DSLContext, code: String): Integer = {
    val id = ctx
      .select(DcId)
      .from(DataConnector)
      .where(DcCode.eq(code).and(DcEnabled.isTrue))
      .fetchOne(DcId)
    if (id == null) {
      throw new BadRequestException(s"$code connector type is not enabled")
    }
    id
  }

  private def ownedRecord(ctx: DSLContext, uid: Integer, id: Integer): Record = {
    if (id == null) throw new BadRequestException("id is required")
    val record = ctx
      .select(
        CredId,
        CredConnectorId,
        CredUid,
        CredName,
        CredStatus,
        CredConfig,
        CredSecretEnc,
        CredLastTestedAt,
        CredLastError,
        DcCode,
        DcDisplayName
      )
      .from(ConnectionCred)
      .join(DataConnector)
      .on(CredConnectorId.eq(DcId))
      .where(CredId.eq(id).and(CredUid.eq(uid)))
      .fetchOne()
    if (record == null) {
      throw new NotFoundException("Connector not found")
    }
    record
  }

  private def loadOwned(
      ctx: DSLContext,
      uid: Integer,
      id: Option[Integer]
  ): Seq[SavedConnectorResponse] = {
    var query = ctx
      .select(
        CredId,
        CredName,
        CredStatus,
        CredConfig,
        CredLastTestedAt,
        CredLastError,
        DcCode,
        DcDisplayName
      )
      .from(ConnectionCred)
      .join(DataConnector)
      .on(CredConnectorId.eq(DcId))
      .where(CredUid.eq(uid))
    id.foreach(value => query = query.and(CredId.eq(value)))
    query
      .orderBy(CredName.asc())
      .fetch()
      .asScala
      .toSeq
      .map(toResponse)
  }
}
