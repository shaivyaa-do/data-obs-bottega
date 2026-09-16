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

import org.apache.texera.amber.core.tuple.{AttributeType, Tuple}
import org.apache.texera.amber.util.JSONUtils.objectMapper
import org.scalamock.scalatest.MockFactory
import org.scalatest.BeforeAndAfter
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

import java.sql.{
  Connection,
  DatabaseMetaData,
  PreparedStatement,
  ResultSet,
  SQLException,
  Statement,
  Types
}
import java.util.Properties
import scala.collection.mutable

class SnowflakeSourceOpExecSpec
    extends AnyFlatSpec
    with Matchers
    with MockFactory
    with BeforeAndAfter {

  private val ACCOUNT = "xy12345.us-east-1"
  private val JDBC_URL = "jdbc:snowflake://xy12345.us-east-1.snowflakecomputing.com/"
  private val BASE = """SELECT * FROM "PUBLIC"."ORDERS" where 1 = 1"""
  private val FETCH_TABLES = """SHOW TABLES IN SCHEMA "ANALYTICS"."PUBLIC""""
  private val ILIKE_CLAUSE = """ AND "NAME" ILIKE ('%' || ? || '%')"""

  private val armed = mutable.Queue.empty[Connection]
  private var lastUrl: String = _
  private var lastProperties: Properties = _

  before {
    armed.clear()
    lastUrl = null
    lastProperties = null
    SnowflakeConnUtil.openConnection = (url, props) => {
      lastUrl = url
      lastProperties = props
      if (armed.isEmpty) throw new SQLException("stub: no connection armed for " + url)
      armed.dequeue()
    }
  }

  after {
    SnowflakeConnUtil.openConnection = SnowflakeConnUtil.driverManagerOpen
  }

  private class TestSnowflakeSourceOpExec(descString: String)
      extends SnowflakeSourceOpExec(descString) {
    def fetchTableNamesSql: String = fetchTablesSql
    def loadTables(): Unit = loadTableNames()
    def sqlQuery: Option[String] = generateSqlQuery
    def filterClause: String = {
      val queryBuilder = new StringBuilder
      addFilterConditions(queryBuilder)
      queryBuilder.result()
    }
  }

  private def descJson(configure: SnowflakeSourceOpDesc => Unit = _ => ()): String = {
    val desc = new SnowflakeSourceOpDesc
    desc.account = ACCOUNT
    desc.warehouse = "COMPUTE_WH"
    desc.database = "ANALYTICS"
    desc.schema = "PUBLIC"
    desc.table = "ORDERS"
    desc.username = "u"
    desc.password = "p"
    desc.host = ACCOUNT
    desc.port = "443"
    configure(desc)
    objectMapper.writeValueAsString(desc)
  }

  private val keywordJson = descJson { desc =>
    desc.keywordSearch = Option(true)
    desc.keywordSearchByColumn = Option("NAME")
    desc.keywords = Option("sore throat")
  }

  private def schemaConn(columns: Seq[(String, Int)]): Connection = {
    val conn = mock[Connection]
    val metaData = mock[DatabaseMetaData]
    val columnsRs = mock[ResultSet]
    (conn.setReadOnly _).expects(true).twice()
    (conn.getMetaData _).expects().returning(metaData)
    (metaData
      .getColumns(_: String, _: String, _: String, _: String))
      .expects(null, null, "ORDERS", null)
      .returning(columnsRs)
    inSequence {
      columns.foreach {
        case (name, jdbcType) =>
          (columnsRs.next _).expects().returning(true)
          (columnsRs.getString(_: String)).expects("COLUMN_NAME").returning(name)
          (columnsRs.getInt(_: String)).expects("DATA_TYPE").returning(jdbcType)
      }
      (columnsRs.next _).expects().returning(false)
    }
    (conn.close _).expects()
    conn
  }

  private def newExec(
      json: String = descJson(),
      columns: Seq[(String, Int)] = Seq("ID" -> Types.INTEGER, "NAME" -> Types.VARCHAR)
  ): TestSnowflakeSourceOpExec = {
    armed.enqueue(schemaConn(columns))
    new TestSnowflakeSourceOpExec(json)
  }

  private def expectTableListing(conn: Connection, tables: Seq[String]): Unit = {
    val statement = mock[Statement]
    val resultSet = mock[ResultSet]
    (conn.createStatement: () => Statement).expects().returning(statement)
    (statement.executeQuery(_: String)).expects(FETCH_TABLES).returning(resultSet)
    inSequence {
      tables.foreach(_ => (resultSet.next _).expects().returning(true))
      (resultSet.next _).expects().returning(false)
    }
    inSequence {
      tables.foreach(table => (resultSet.getString(_: String)).expects("name").returning(table))
    }
    (resultSet.close _).expects()
    (statement.close _).expects()
  }

  "SnowflakeSourceOpExec" should
    "deserialize a SnowflakeSourceOpDesc and derive the schema from JDBC metadata" in {
    val exec = newExec(columns =
      Seq("ID" -> Types.INTEGER, "NAME" -> Types.VARCHAR, "CREATED" -> Types.TIMESTAMP)
    )

    exec.desc shouldBe a[SnowflakeSourceOpDesc]
    exec.desc.table shouldBe "ORDERS"
    exec.desc.database shouldBe "ANALYTICS"
    exec.schema.getAttributeNames shouldBe List("ID", "NAME", "CREATED")
    exec.schema.getAttribute("ID").getType shouldBe AttributeType.INTEGER
    exec.schema.getAttribute("NAME").getType shouldBe AttributeType.STRING
    exec.schema.getAttribute("CREATED").getType shouldBe AttributeType.TIMESTAMP
    exec.fetchTableNamesSql shouldBe FETCH_TABLES
  }

  "SnowflakeSourceOpExec.establishConn" should
    "dial the Snowflake JDBC URL with password only in Properties" in {
    val exec = newExec()
    lastUrl shouldBe JDBC_URL
    lastUrl.toLowerCase should not include "password"

    val reconnected = mock[Connection]
    (reconnected.setReadOnly _).expects(true)
    armed.enqueue(reconnected)

    exec.establishConn() should be theSameInstanceAs reconnected
    lastUrl shouldBe JDBC_URL
    lastProperties.getProperty("user") shouldBe "u"
    lastProperties.getProperty("password") shouldBe "p"
    lastProperties.getProperty("authenticator") shouldBe "snowflake"
    lastProperties.getProperty("warehouse") shouldBe "COMPUTE_WH"
    lastProperties.getProperty("db") shouldBe "ANALYTICS"
    lastProperties.getProperty("schema") shouldBe "PUBLIC"
  }

  it should "propagate the SQLException when the server refuses the connection" in {
    val exec = newExec()
    a[SQLException] should be thrownBy exec.establishConn()
  }

  "SnowflakeSourceOpExec.loadTableNames" should
    "list SHOW TABLES names scoped to database.schema" in {
    val exec = newExec()
    val conn = mock[Connection]
    expectTableListing(conn, Seq("ORDERS", "CUSTOMERS"))

    exec.connection = conn
    exec.loadTables()

    exec.tableNames.toList shouldBe List("ORDERS", "CUSTOMERS")
  }

  it should "leave the table list empty when the schema exposes no tables" in {
    val exec = newExec()
    val conn = mock[Connection]
    expectTableListing(conn, Seq.empty)

    exec.connection = conn
    exec.loadTables()

    exec.tableNames shouldBe empty
  }

  "SnowflakeSourceOpExec.open" should "connect and accept a table present in the listing" in {
    val exec = newExec()
    val conn = mock[Connection]
    (conn.setReadOnly _).expects(true)
    expectTableListing(conn, Seq("CUSTOMERS", "ORDERS"))
    armed.enqueue(conn)

    exec.open()

    exec.connection should be theSameInstanceAs conn
    exec.tableNames.toList shouldBe List("CUSTOMERS", "ORDERS")
    exec.batchByAttribute shouldBe None
  }

  it should "reject a table missing from the listing" in {
    val exec = newExec()
    val conn = mock[Connection]
    (conn.setReadOnly _).expects(true)
    expectTableListing(conn, Seq("CUSTOMERS"))
    armed.enqueue(conn)

    intercept[RuntimeException](exec.open()).getMessage shouldBe
      "Can't find the given table `ORDERS`."
  }

  "SnowflakeSourceOpExec.addFilterConditions" should
    "emit an ILIKE bind placeholder for a string column" in {
    val exec = newExec(keywordJson)
    exec.filterClause shouldBe ILIKE_CLAUSE
    exec.filterClause should not include "sore throat"
  }

  it should "add nothing when keyword search is switched off" in {
    val exec = newExec(descJson { desc =>
      desc.keywordSearch = Option(false)
      desc.keywordSearchByColumn = Option("NAME")
      desc.keywords = Option("sore throat")
    })
    exec.filterClause shouldBe ""
  }

  it should "refuse a keyword search on a non-string column" in {
    val exec = newExec(descJson { desc =>
      desc.keywordSearch = Option(true)
      desc.keywordSearchByColumn = Option("ID")
      desc.keywords = Option("42")
    })
    intercept[RuntimeException](exec.filterClause).getMessage shouldBe
      "Can't do keyword search on type integer"
  }

  "SnowflakeSourceOpExec.generateSqlQuery" should
    "select from the quoted schema.table and splice ILIKE" in {
    val exec = newExec(keywordJson)
    exec.sqlQuery shouldBe Some("\n" + BASE + ILIKE_CLAUSE + ";")

    exec.curLimit = Some(3L)
    exec.curOffset = Some(2L)
    exec.sqlQuery shouldBe Some("\n" + BASE + ILIKE_CLAUSE + " LIMIT ? OFFSET ?;")
  }

  it should "produce a plain statement when no keyword search is configured" in {
    newExec().sqlQuery shouldBe Some("\n" + BASE + ";")
  }

  "SnowflakeSourceOpExec.produceTuple" should "run the ILIKE query and bind the keyword" in {
    val exec = newExec(keywordJson)
    val conn = mock[Connection]
    val queryStatement = mock[PreparedStatement]
    val rows = mock[ResultSet]

    (conn.setReadOnly _).expects(true)
    expectTableListing(conn, Seq("ORDERS"))

    (conn
      .prepareStatement(_: String))
      .expects("\n" + BASE + ILIKE_CLAUSE + ";")
      .returning(queryStatement)
    (queryStatement.setString _).expects(1, "sore throat")
    (queryStatement.executeQuery: () => ResultSet).expects().returning(rows)
    inSequence {
      (rows.next _).expects().returning(true)
      (rows.next _).expects().returning(false)
    }
    (rows.getObject(_: String)).expects("ID").returning(Int.box(7))
    (rows.getObject(_: String)).expects("NAME").returning("a sore throat")
    (rows.close _).expects()
    (queryStatement.close _).expects()

    armed.enqueue(conn)
    exec.open()
    val tuples = exec.produceTuple().map(_.asInstanceOf[Tuple]).toList

    tuples should have size 1
    tuples.head.getField[Any]("ID") shouldBe 7
    tuples.head.getField[Any]("NAME") shouldBe "a sore throat"
  }

  "SnowflakeSourceOpExec.close" should "close the connection established by open" in {
    val exec = newExec()
    val conn = mock[Connection]
    (conn.setReadOnly _).expects(true)
    expectTableListing(conn, Seq("ORDERS"))
    (conn.close _).expects()
    armed.enqueue(conn)

    exec.open()
    exec.close()
  }
}
