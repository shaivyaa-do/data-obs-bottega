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

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.scala.DefaultScalaModule
import jakarta.ws.rs.{BadRequestException, NotFoundException, WebApplicationException}
import org.apache.texera.auth.SessionUser
import org.apache.texera.common.util.AesGcmCipher
import org.apache.texera.dao.MockTexeraDB
import org.apache.texera.dao.jooq.generated.enums.UserRoleEnum
import org.apache.texera.dao.jooq.generated.tables.daos.UserDao
import org.apache.texera.dao.jooq.generated.tables.pojos.User
import org.apache.texera.service.resource.ConnectorResource.{
  CreateConnectorRequest,
  PatchConnectorRequest,
  SavedConnectorResponse
}
import org.apache.texera.service.util.{JdbcListTables, JdbcSelectOne, PostgresJdbcTester}
import org.jooq.JSONB
import org.jooq.impl.DSL
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}

import scala.jdk.CollectionConverters._
import scala.util.Using

class ConnectorResourceSpec
    extends AnyFlatSpec
    with Matchers
    with MockTexeraDB
    with BeforeAndAfterAll
    with BeforeAndAfterEach {

  private val mapper = new ObjectMapper().registerModule(DefaultScalaModule)
  private val cipher = new AesGcmCipher(AesGcmCipher.keyFromSecret("connector-resource-spec"))
  private val resource = new ConnectorResource(cipher, PostgresJdbcTester)
  private val secretPassword = "super-secret-hunter2"

  private val owner: User = {
    val user = new User
    user.setName("connector_owner")
    user.setEmail("connector_owner@test.com")
    user.setRole(UserRoleEnum.REGULAR)
    user
  }

  private val stranger: User = {
    val user = new User
    user.setName("connector_stranger")
    user.setEmail("connector_stranger@test.com")
    user.setRole(UserRoleEnum.REGULAR)
    user
  }

  private lazy val ownerSession = new SessionUser(owner)
  private lazy val strangerSession = new SessionUser(stranger)

  private val Schema = "texera_db"
  private val Cred = DSL.table(DSL.name(Schema, "connection_cred"))
  private val Audit = DSL.table(DSL.name(Schema, "connection_audit"))
  private val DataConnector = DSL.table(DSL.name(Schema, "data_connector"))
  private val SecretEnc =
    DSL.field(DSL.name(Schema, "connection_cred", "secret_enc"), classOf[Array[Byte]])
  private val ConfigField = DSL.field(DSL.name(Schema, "connection_cred", "config"), classOf[JSONB])
  private val CredId = DSL.field(DSL.name(Schema, "connection_cred", "id"), classOf[Integer])
  private val AuditAction =
    DSL.field(DSL.name(Schema, "connection_audit", "action"), classOf[String])
  private val AuditDetail =
    DSL.field(DSL.name(Schema, "connection_audit", "detail"), classOf[JSONB])
  private val AuditConnectionId =
    DSL.field(DSL.name(Schema, "connection_audit", "connection_id"), classOf[Integer])
  private val AuditId = DSL.field(DSL.name(Schema, "connection_audit", "id"), classOf[Integer])

  override protected def beforeAll(): Unit = {
    super.beforeAll()
    initializeDBAndReplaceDSLContext()
    val userDao = new UserDao(getDSLContext.configuration())
    userDao.insert(owner)
    userDao.insert(stranger)
  }

  override protected def beforeEach(): Unit = {
    super.beforeEach()
    getDSLContext.deleteFrom(Audit).execute()
    getDSLContext.deleteFrom(Cred).execute()
  }

  override protected def afterAll(): Unit = {
    try shutdownDB()
    finally super.afterAll()
  }

  private def createRequest(
      name: String = "lab-pg",
      code: String = "postgres",
      host: String = "127.0.0.1",
      port: Any = getDBInstance.getPort,
      database: String = uniqueDbName,
      username: String = "postgres",
      schema: Option[String] = Some("public"),
      password: String = ""
  ): CreateConnectorRequest =
    CreateConnectorRequest(name, code, host, port, database, username, schema, password)

  private def jsonOf(value: Any): String = mapper.writeValueAsString(value)

  private def assertPublic(row: SavedConnectorResponse, password: String): Unit = {
    jsonOf(row) should not include password
    jsonOf(row) should not include "secret_enc"
    row.config.keys.map(_.toLowerCase) should contain noneOf ("password", "secret", "secret_enc")
  }

  private def dbConfigAndSecret(id: Int): (String, Array[Byte]) = {
    val record = getDSLContext
      .select(ConfigField, SecretEnc)
      .from(Cred)
      .where(CredId.eq(id))
      .fetchOne()
    (record.get(ConfigField).data(), record.get(SecretEnc))
  }

  private def auditActions(id: Int): Seq[String] =
    getDSLContext
      .select(AuditAction)
      .from(Audit)
      .where(AuditConnectionId.eq(id))
      .orderBy(AuditId.asc())
      .fetch(AuditAction)
      .asScala
      .toSeq

  private def auditJson(id: Int): String =
    getDSLContext
      .select(AuditDetail)
      .from(Audit)
      .where(AuditConnectionId.eq(id))
      .fetch(AuditDetail)
      .asScala
      .map(j => if (j == null) "" else j.data())
      .mkString(" ")

  private def seedPublicTables(): Unit = {
    Using.resource(newRawConnection()) { conn =>
      Using.resource(conn.createStatement()) { stmt =>
        stmt.execute("CREATE TABLE IF NOT EXISTS buildings (id int)")
        stmt.execute("CREATE TABLE IF NOT EXISTS hourly_kwh (id int)")
        stmt.execute("CREATE SCHEMA IF NOT EXISTS other")
        stmt.execute("CREATE TABLE IF NOT EXISTS other.hidden (id int)")
      }
    }
  }

  "GET /types" should "return the enabled postgres and mysql connectors and their fields_schema" in {
    val types = resource.listTypes(ownerSession)
    types.map(_.code) shouldBe Seq("mysql", "postgres")
    types.map(_.displayName) shouldBe Seq("MySQL", "PostgreSQL")
    val mysql = types.find(_.code == "mysql").get
    mysql.fieldsSchema.get("fields").isArray shouldBe true
    mysql.fieldsSchema.toString should include("\"default\":\"3306\"")
    jsonOf(types) should not include secretPassword
  }

  it should "omit disabled connector types" in {
    getDSLContext
      .update(DataConnector)
      .set(
        DSL.field(DSL.name(Schema, "data_connector", "is_enabled"), classOf[java.lang.Boolean]),
        java.lang.Boolean.FALSE
      )
      .where(DSL.field(DSL.name(Schema, "data_connector", "code"), classOf[String]).eq("postgres"))
      .execute()
    try {
      resource.listTypes(ownerSession).map(_.code) shouldBe Seq("mysql")
    } finally {
      getDSLContext
        .update(DataConnector)
        .set(
          DSL.field(DSL.name(Schema, "data_connector", "is_enabled"), classOf[java.lang.Boolean]),
          java.lang.Boolean.TRUE
        )
        .where(
          DSL.field(DSL.name(Schema, "data_connector", "code"), classOf[String]).eq("postgres")
        )
        .execute()
    }
  }

  "POST /connectors" should "store non-secrets in config and the password only in secret_enc" in {
    val created = resource.createConnector(createRequest(password = secretPassword), ownerSession)
    created.name shouldBe "lab-pg"
    created.connectorCode shouldBe "postgres"
    created.connectorDisplayName shouldBe "PostgreSQL"
    created.config("host") shouldBe "127.0.0.1"
    created.config("database") shouldBe uniqueDbName
    created.config.get("schema") shouldBe Some("public")
    assertPublic(created, secretPassword)

    val (configJson, secretEnc) = dbConfigAndSecret(created.id)
    configJson should not include secretPassword
    configJson should not include "password"
    cipher.decrypt(secretEnc) shouldBe secretPassword
    auditActions(created.id) shouldBe Seq("create")
    auditJson(created.id) should not include secretPassword
  }

  it should "accept a string port" in {
    val created =
      resource.createConnector(createRequest(port = getDBInstance.getPort.toString), ownerSession)
    created.config("port") shouldBe getDBInstance.getPort
  }

  it should "accept a mysql connectorCode" in {
    val created =
      resource.createConnector(
        createRequest(name = "lab-mysql", code = "mysql", schema = None, password = secretPassword),
        ownerSession
      )
    created.connectorCode shouldBe "mysql"
    created.connectorDisplayName shouldBe "MySQL"
    created.config("host") shouldBe "127.0.0.1"
    created.config.get("schema") shouldBe None
    assertPublic(created, secretPassword)
  }

  it should "reject an unsupported connectorCode" in {
    val thrown = intercept[BadRequestException] {
      resource.createConnector(createRequest(code = "snowflake"), ownerSession)
    }
    thrown.getMessage should include("Unsupported")
  }

  it should "reject a blank name" in {
    intercept[BadRequestException] {
      resource.createConnector(createRequest(name = "  "), ownerSession)
    }
  }

  it should "return 409 when the same user reuses a name" in {
    resource.createConnector(createRequest(), ownerSession)
    val thrown = intercept[WebApplicationException] {
      resource.createConnector(createRequest(), ownerSession)
    }
    thrown.getResponse.getStatus shouldBe 409
  }

  it should "allow two users to use the same connector name" in {
    resource.createConnector(createRequest(), ownerSession)
    val other = resource.createConnector(createRequest(), strangerSession)
    other.name shouldBe "lab-pg"
  }

  "GET /connectors" should "return only the current user's connectors and never the password" in {
    resource.createConnector(createRequest(name = "mine", password = secretPassword), ownerSession)
    resource.createConnector(createRequest(name = "theirs"), strangerSession)

    val mine = resource.listConnectors(ownerSession)
    mine.map(_.name) shouldBe Seq("mine")
    mine.foreach(row => assertPublic(row, secretPassword))
    jsonOf(mine) should not include "theirs"
  }

  "POST /connectors/{id}/test" should "return the connector as active after SELECT 1" in {
    val created = resource.createConnector(createRequest(), ownerSession)
    val tested = resource.testConnector(created.id, ownerSession)
    tested.status shouldBe "active"
    tested.lastError shouldBe None
    tested.lastTestedAt shouldBe defined
    auditActions(created.id) should contain("test")
  }

  it should "return 400, set status=error, and audit test_fail without leaking a stack" in {
    val created = resource.createConnector(
      createRequest(database = "does_not_exist", password = secretPassword),
      ownerSession
    )
    val thrown = intercept[BadRequestException] {
      resource.testConnector(created.id, ownerSession)
    }
    thrown.getMessage should include("Could not connect to PostgreSQL")
    thrown.getMessage should not include secretPassword
    Option(thrown.getCause) shouldBe None

    val listed = resource.listConnectors(ownerSession).head
    listed.status shouldBe "error"
    listed.lastError.get should include("Could not connect to PostgreSQL")
    listed.lastError.get should not include secretPassword
    auditActions(created.id) should contain("test_fail")
    auditJson(created.id) should not include secretPassword
  }

  it should "404 when the connector belongs to another user" in {
    val created = resource.createConnector(createRequest(), ownerSession)
    intercept[NotFoundException] {
      resource.testConnector(created.id, strangerSession)
    }
  }

  "PATCH /connectors/{id}" should "rename and re-encrypt a new password" in {
    val created =
      resource.createConnector(createRequest(password = "old-password"), ownerSession)
    val patched = resource.patchConnector(
      created.id,
      PatchConnectorRequest(name = Some("renamed"), password = Some(secretPassword)),
      ownerSession
    )
    patched.name shouldBe "renamed"
    assertPublic(patched, secretPassword)
    cipher.decrypt(dbConfigAndSecret(created.id)._2) shouldBe secretPassword
    auditActions(created.id) should contain("update")
  }

  it should "409 when renaming onto another of the user's names" in {
    resource.createConnector(createRequest(name = "alpha"), ownerSession)
    val beta = resource.createConnector(createRequest(name = "beta"), ownerSession)
    val thrown = intercept[WebApplicationException] {
      resource.patchConnector(
        beta.id,
        PatchConnectorRequest(name = Some("alpha")),
        ownerSession
      )
    }
    thrown.getResponse.getStatus shouldBe 409
  }

  "DELETE /connectors/{id}" should "remove the row so it no longer lists" in {
    val created = resource.createConnector(createRequest(), ownerSession)
    resource.deleteConnector(created.id, ownerSession)
    resource.listConnectors(ownerSession).map(_.id) shouldBe empty
    intercept[NotFoundException] {
      resource.deleteConnector(created.id, ownerSession)
    }
  }

  it should "404 for a missing id" in {
    intercept[NotFoundException] {
      resource.deleteConnector(999999, ownerSession)
    }
  }

  "GET /connectors/{id}/tables" should "return public tables from the saved connection, not catalogs" in {
    seedPublicTables()
    val created = resource.createConnector(createRequest(password = secretPassword), ownerSession)
    val tables = resource.listTables(created.id, ownerSession)
    tables shouldBe Seq("buildings", "hourly_kwh")
    tables should not contain "hidden"
    tables should not contain "connection_cred"
    tables should not contain "pg_class"
    jsonOf(tables) should not include secretPassword
  }

  it should "list texera_db schema tables only when that schema is saved on the connection" in {
    val created =
      resource.createConnector(createRequest(schema = Some("texera_db")), ownerSession)
    val tables = resource.listTables(created.id, ownerSession)
    tables should contain("connection_cred")
    tables should not contain "buildings"
  }

  it should "404 when the connector belongs to another user" in {
    val created = resource.createConnector(createRequest(), ownerSession)
    intercept[NotFoundException] {
      resource.listTables(created.id, strangerSession)
    }
  }

  it should "reject a connector that is not active" in {
    val created = resource.createConnector(createRequest(), ownerSession)
    getDSLContext
      .update(Cred)
      .set(DSL.field(DSL.name(Schema, "connection_cred", "status"), classOf[String]), "disabled")
      .where(CredId.eq(created.id))
      .execute()
    val thrown = intercept[BadRequestException] {
      resource.listTables(created.id, ownerSession)
    }
    thrown.getMessage should include("active")
  }

  it should "return 400 without leaking the password when JDBC listing fails" in {
    val created = resource.createConnector(
      createRequest(database = "does_not_exist", password = secretPassword),
      ownerSession
    )
    val thrown = intercept[BadRequestException] {
      resource.listTables(created.id, ownerSession)
    }
    thrown.getMessage should include("Could not connect to PostgreSQL")
    thrown.getMessage should not include secretPassword
  }

  "parsePort" should "accept ints and numeric strings and reject junk" in {
    ConnectorResource.parsePort(5432) shouldBe 5432
    ConnectorResource.parsePort("5432") shouldBe 5432
    intercept[BadRequestException] {
      ConnectorResource.parsePort("abc")
    }
    intercept[BadRequestException] {
      ConnectorResource.parsePort(0)
    }
    ConnectorResource.parsePort(null, 3306) shouldBe 3306
  }

  "POST /connectors/{id}/test for mysql" should
    "dial jdbc:mysql://host:port/database with user and password and run SELECT 1" in {
    val recording = new JdbcSelectOne with JdbcListTables {
      var lastUrl: String = ""
      var lastUser: String = ""
      var lastPassword: String = ""
      var lastSchema: String = ""
      override def selectOne(url: String, username: String, password: String): Unit = {
        lastUrl = url
        lastUser = username
        lastPassword = password
      }
      override def listTables(
          url: String,
          username: String,
          password: String,
          schema: String
      ): Seq[String] = {
        lastUrl = url
        lastSchema = schema
        Seq("orders")
      }
    }
    val mysqlResource = new ConnectorResource(
      cipher,
      Map("postgres" -> PostgresJdbcTester, "mysql" -> recording)
    )
    val created = mysqlResource.createConnector(
      createRequest(
        name = "lab-mysql",
        code = "mysql",
        schema = None,
        password = secretPassword
      ),
      ownerSession
    )
    val tested = mysqlResource.testConnector(created.id, ownerSession)
    tested.status shouldBe "active"
    recording.lastUrl shouldBe
      s"jdbc:mysql://127.0.0.1:${getDBInstance.getPort}/$uniqueDbName?autoReconnect=true&useSSL=true"
    recording.lastUser shouldBe "postgres"
    recording.lastPassword shouldBe secretPassword
    recording.lastUrl.toLowerCase should not include "password="

    val tables = mysqlResource.listTables(created.id, ownerSession)
    tables shouldBe Seq("orders")
    recording.lastSchema shouldBe uniqueDbName
  }
}
