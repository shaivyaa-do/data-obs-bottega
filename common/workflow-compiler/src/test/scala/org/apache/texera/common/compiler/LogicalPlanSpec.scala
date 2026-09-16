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

package org.apache.texera.common.compiler

import org.apache.commons.vfs2.FileNotFoundException
import org.apache.texera.amber.core.virtualidentity.OperatorIdentity
import org.apache.texera.amber.core.workflow.PortIdentity
import org.apache.texera.amber.operator.aggregate.AggregateOpDesc
import org.apache.texera.amber.operator.hashJoin.HashJoinOpDesc
import org.apache.texera.amber.operator.keywordSearch.KeywordSearchOpDesc
import org.apache.texera.amber.operator.source.scan.csv.CSVScanSourceOpDesc
import org.apache.texera.amber.operator.source.scan.json.JSONLScanSourceOpDesc
import org.apache.texera.amber.operator.source.sql.mysql.MySQLSourceOpDesc
import org.apache.texera.amber.operator.source.sql.postgresql.PostgreSQLSourceOpDesc
import org.apache.texera.amber.operator.source.sql.snowflake.SnowflakeSourceOpDesc
import org.apache.texera.amber.operator.split.SplitOpDesc
import org.apache.texera.amber.operator.udf.python.DualInputPortsPythonUDFOpDescV2
import org.apache.texera.amber.operator.udf.python.source.PythonUDFSourceOpDescV2
import org.apache.texera.amber.operator.union.UnionOpDesc
import org.apache.texera.amber.operator.{LogicalOp, TestOperators}
import org.apache.texera.common.compiler.model.{LogicalLink, LogicalPlan, LogicalPlanPojo}
import org.apache.texera.common.compiler.mysql.{MysqlConnectionLookup, MysqlJdbcCredentials}
import org.apache.texera.common.compiler.postgres.{
  PostgresConnectionLookup,
  PostgresJdbcCredentials
}
import org.apache.texera.common.compiler.snowflake.{
  SnowflakeConnectionLookup,
  SnowflakeJdbcCredentials
}
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

import scala.collection.mutable.ArrayBuffer
import scala.jdk.CollectionConverters.IteratorHasAsScala

class LogicalPlanSpec extends AnyFlatSpec with Matchers {

  // ---------------------------------------------------------------------------
  // Fixtures
  // ---------------------------------------------------------------------------

  private def csv(): CSVScanSourceOpDesc = TestOperators.headerlessSmallCsvScanOpDesc()
  private def keyword(): KeywordSearchOpDesc = TestOperators.keywordSearchOpDesc("column-1", "Asia")

  /** Give an operator a readable, stable id so failure messages and graph
    * assertions read in terms of the operator's role rather than a UUID.
    */
  private def named[T <: LogicalOp](op: T, id: String): T = {
    op.setOperatorId(id)
    op
  }

  private def link(
      from: OperatorIdentity,
      to: OperatorIdentity,
      fromPort: Int = 0,
      toPort: Int = 0
  ): LogicalLink =
    LogicalLink(from, PortIdentity(fromPort), to, PortIdentity(toPort))

  // ---------------------------------------------------------------------------
  // A realistic, non-trivial workflow used by the graph-query tests below.
  //
  //   Sources (three different operator types):
  //     csv : CSV scan      json : JSONL scan      pySrc : Python UDF source
  //
  //   Edges (target port in parentheses):
  //     csv   ─▶ join  (0, "left")        join  ─▶ udf2  (0, "model")
  //     json  ─▶ join  (1, "right")       pySrc ─▶ udf2  (1, "tuples")
  //     udf2  ─▶ union (0)                json  ─▶ union (0)   ← fan-out: 2nd link into the SAME port
  //     union ─▶ split (0)
  //     split ─▶ aggA  (from out 0)       split ─▶ aggB  (from out 1)   ← two distinct OUTPUT ports
  //
  //   Shapes exercised: a join (two distinct input ports), a dual-input UDF
  //   (two distinct input ports), a union (two links merged into ONE input
  //   port), a split (two distinct output ports), and a fan-out source
  //   (json feeds both the join and the union).
  //   Sources (in-degree 0): csv, json, pySrc.   Terminals (out-degree 0): aggA, aggB.
  // ---------------------------------------------------------------------------

  private case class Rich(
      plan: LogicalPlan,
      csv: CSVScanSourceOpDesc,
      json: JSONLScanSourceOpDesc,
      pySrc: PythonUDFSourceOpDescV2,
      join: HashJoinOpDesc[String],
      udf2: DualInputPortsPythonUDFOpDescV2,
      union: UnionOpDesc,
      split: SplitOpDesc,
      aggA: AggregateOpDesc,
      aggB: AggregateOpDesc
  )

  private def richPlan(): Rich = {
    val csv = named(TestOperators.headerlessSmallCsvScanOpDesc(), "csv-source")
    val json = named(TestOperators.smallJSONLScanOpDesc(), "jsonl-source")
    val pySrc = named(TestOperators.pythonSourceOpDesc(5), "python-source")
    val join = named(TestOperators.joinOpDesc("country", "country"), "hash-join")
    val udf2 = named(new DualInputPortsPythonUDFOpDescV2(), "dual-input-udf")
    val union = named(new UnionOpDesc(), "union")
    val split = named(new SplitOpDesc(), "split")
    val aggA = named(new AggregateOpDesc(), "aggregate-a")
    val aggB = named(new AggregateOpDesc(), "aggregate-b")

    // Order matters for getUpstreamLinks: links are returned in construction order.
    val links = List(
      link(csv.operatorIdentifier, join.operatorIdentifier, toPort = 0), // join: left
      link(json.operatorIdentifier, join.operatorIdentifier, toPort = 1), // join: right
      link(join.operatorIdentifier, udf2.operatorIdentifier, toPort = 0), // udf2: model
      link(pySrc.operatorIdentifier, udf2.operatorIdentifier, toPort = 1), // udf2: tuples
      link(udf2.operatorIdentifier, union.operatorIdentifier, toPort = 0), // union <- udf2
      link(
        json.operatorIdentifier,
        union.operatorIdentifier,
        toPort = 0
      ), // union <- json (2nd into port 0)
      link(union.operatorIdentifier, split.operatorIdentifier, toPort = 0),
      link(split.operatorIdentifier, aggA.operatorIdentifier, fromPort = 0), // split: output 0
      link(split.operatorIdentifier, aggB.operatorIdentifier, fromPort = 1) // split: output 1
    )

    // Deliberately pass the operators in a NON-topological order so the
    // topological-sort test proves real reordering, not input identity.
    val operators = List[LogicalOp](aggB, split, union, udf2, join, csv, pySrc, json, aggA)

    Rich(LogicalPlan(operators, links), csv, json, pySrc, join, udf2, union, split, aggA, aggB)
  }

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  "LogicalPlan" should "expose the operators and links it was constructed with" in {
    val a = csv()
    val b = keyword()
    val l = link(a.operatorIdentifier, b.operatorIdentifier)
    val plan = LogicalPlan(List(a, b), List(l))
    assert(plan.operators == List(a, b))
    assert(plan.links == List(l))
  }

  "LogicalPlan.apply(LogicalPlanPojo)" should
    "lift the POJO's operators and links, ignoring opsToViewResult / opsToReuseResult" in {
    val a = csv()
    val b = keyword()
    val l = link(a.operatorIdentifier, b.operatorIdentifier)
    val pojo = LogicalPlanPojo(
      operators = List(a, b),
      links = List(l),
      // `operatorId` is private — use the public OperatorIdentity wrapper.
      opsToViewResult = List(b.operatorIdentifier.id), // intentionally non-empty
      opsToReuseResult = List(a.operatorIdentifier.id)
    )
    val plan = LogicalPlan(pojo)
    assert(plan.operators == List(a, b))
    assert(plan.links == List(l))
  }

  // ---------------------------------------------------------------------------
  // getTopologicalOpIds
  // ---------------------------------------------------------------------------

  "LogicalPlan.getTopologicalOpIds" should "yield a topological order on a linear chain" in {
    val a = csv()
    val b = keyword()
    val plan = LogicalPlan(List(a, b), List(link(a.operatorIdentifier, b.operatorIdentifier)))
    val order = plan.getTopologicalOpIds.asScala.toList
    assert(order == List(a.operatorIdentifier, b.operatorIdentifier))
  }

  it should "honor every edge on a realistic plan (join, union, dual-input UDF, split fan-out)" in {
    val r = richPlan()
    val order = r.plan.getTopologicalOpIds.asScala.toList

    // Every operator appears exactly once.
    assert(order.size == r.plan.operators.size)
    assert(order.toSet == r.plan.operators.map(_.operatorIdentifier).toSet)

    // The defining property of a topological order: each edge points "forward".
    val positionOf = order.zipWithIndex.toMap
    r.plan.links.foreach { l =>
      assert(
        positionOf(l.fromOpId) < positionOf(l.toOpId),
        s"topological order violates edge ${l.fromOpId.id} -> ${l.toOpId.id}; " +
          s"order = ${order.map(_.id)}"
      )
    }
  }

  // ---------------------------------------------------------------------------
  // getOperator
  // ---------------------------------------------------------------------------

  "LogicalPlan.getOperator" should "return the operator with the requested identifier" in {
    val r = richPlan()
    assert(r.plan.getOperator(r.join.operatorIdentifier) eq r.join)
    assert(r.plan.getOperator(r.split.operatorIdentifier) eq r.split)
    assert(r.plan.getOperator(r.pySrc.operatorIdentifier) eq r.pySrc)
  }

  it should "throw NoSuchElementException for an unknown operator id" in {
    val a = csv()
    val plan = LogicalPlan(List(a), List.empty)
    intercept[NoSuchElementException] {
      plan.getOperator(OperatorIdentity("not-in-plan"))
    }
  }

  // ---------------------------------------------------------------------------
  // getTerminalOperatorIds
  // ---------------------------------------------------------------------------

  "LogicalPlan.getTerminalOperatorIds" should
    "return every out-degree-0 operator on a realistic plan (the two split sinks)" in {
    val r = richPlan()
    assert(
      r.plan.getTerminalOperatorIds.toSet ==
        Set(r.aggA.operatorIdentifier, r.aggB.operatorIdentifier)
    )
  }

  it should "return the single sink in a linear chain" in {
    val a = csv()
    val b = keyword()
    val plan = LogicalPlan(List(a, b), List(link(a.operatorIdentifier, b.operatorIdentifier)))
    assert(plan.getTerminalOperatorIds == List(b.operatorIdentifier))
  }

  it should "return every operator when there are no links" in {
    // An isolated set of operators with no edges — every operator has
    // out-degree 0 and is therefore terminal.
    val a = csv()
    val b = keyword()
    val plan = LogicalPlan(List(a, b), List.empty)
    assert(plan.getTerminalOperatorIds.toSet == Set(a.operatorIdentifier, b.operatorIdentifier))
  }

  it should "return an empty list for an empty plan" in {
    val plan = LogicalPlan(List.empty, List.empty)
    assert(plan.getTerminalOperatorIds.isEmpty)
  }

  // ---------------------------------------------------------------------------
  // getUpstreamLinks
  // ---------------------------------------------------------------------------

  "LogicalPlan.getUpstreamLinks" should
    "return both inbound links on their distinct ports for a join" in {
    val r = richPlan()
    val up = r.plan.getUpstreamLinks(r.join.operatorIdentifier)
    // Construction order: csv (left, port 0) then json (right, port 1).
    assert(up.map(_.fromOpId) == List(r.csv.operatorIdentifier, r.json.operatorIdentifier))
    assert(up.map(_.toPortId) == List(PortIdentity(0), PortIdentity(1)))
  }

  it should "return both inbound links on their distinct ports for a dual-input UDF" in {
    val r = richPlan()
    val up = r.plan.getUpstreamLinks(r.udf2.operatorIdentifier)
    assert(up.map(_.fromOpId) == List(r.join.operatorIdentifier, r.pySrc.operatorIdentifier))
    assert(up.map(_.toPortId) == List(PortIdentity(0), PortIdentity(1)))
  }

  it should "return every inbound link merged into a union's single input port, in order" in {
    val r = richPlan()
    val up = r.plan.getUpstreamLinks(r.union.operatorIdentifier)
    // udf2 and json both feed union's port 0; the result preserves construction order.
    assert(up.map(_.fromOpId) == List(r.udf2.operatorIdentifier, r.json.operatorIdentifier))
    assert(up.map(_.toPortId).toSet == Set(PortIdentity(0)))
  }

  it should "return an empty list for a source operator with no inbound links" in {
    val r = richPlan()
    assert(r.plan.getUpstreamLinks(r.csv.operatorIdentifier).isEmpty)
  }

  // ---------------------------------------------------------------------------
  // resolveScanSourceOpFileName
  // ---------------------------------------------------------------------------
  //
  // A successful resolution of a real file path is environment-dependent
  // (resolved through FileResolver, which can reach LakeFS / dataset
  // service), so we pin the FAILURE behavior here. The method has two modes,
  // both used in production:
  //   1. Some(errorList) — every failing operator is appended to errorList by
  //      opId and resolution CONTINUES (collect-all). Used by the editing-path
  //      compiler in workflow-compiling-service so the UI can surface every
  //      bad operator at once.
  //   2. None — the first failure rethrows (fail-fast). Used by the amber
  //      WorkflowCompiler on the execution path, right before a run.
  // To force a failure deterministically, we point a ScanSource fixture at a
  // non-existent file and assert the error surfaces both ways.

  private def csvWithMissingFile(): CSVScanSourceOpDesc = {
    val op = TestOperators.headerlessSmallCsvScanOpDesc()
    // Use a relative single-segment file name so `FileResolver` short-
    // circuits BOTH resolvers without touching the DB: localResolveFunc
    // fails (file doesn't exist) and datasetResolveFunc's parser bails
    // immediately (path segments < 4) before any dataset DB query.
    op.fileName = Some("nonexistent-test-file.csv")
    op
  }

  "LogicalPlan.resolveScanSourceOpFileName" should
    "append a per-operator error for every failing scan source instead of throwing" in {
    // Two independent broken scans: Some(errorList) must collect BOTH (it does
    // not stop at the first failure), keyed by their distinct operator ids.
    val brokenA = csvWithMissingFile()
    val brokenB = csvWithMissingFile()
    val plan = LogicalPlan(List(brokenA, brokenB), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolveScanSourceOpFileName(Some(errors))
    assert(errors.size == 2, s"expected both failures captured, got: $errors")
    assert(
      errors.map(_._1).toSet ==
        Set(brokenA.operatorIdentifier, brokenB.operatorIdentifier)
    )
  }

  it should "rethrow FileNotFoundException when no errorList is provided" in {
    // `FileResolver.resolve` raises `org.apache.commons.vfs2.FileNotFoundException`
    // when all resolvers fail. Pin the specific type so an unrelated failure
    // mode (e.g. NPE) doesn't silently satisfy this test.
    val brokenOp = csvWithMissingFile()
    val plan = LogicalPlan(List(brokenOp), List.empty)
    intercept[FileNotFoundException] {
      plan.resolveScanSourceOpFileName(None)
    }
  }

  it should "leave non-ScanSourceOpDesc operators untouched (no errors, no resolution)" in {
    // KeywordSearch is not a ScanSourceOpDesc — the `case _` branch
    // skips it entirely. An errorList provided here must remain empty.
    val k = keyword()
    val plan = LogicalPlan(List(k), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolveScanSourceOpFileName(Some(errors))
    assert(errors.isEmpty)
  }

  // ---------------------------------------------------------------------------
  // resolvePostgresConnections
  // ---------------------------------------------------------------------------

  private def postgresWithConnection(id: String = "7"): PostgreSQLSourceOpDesc = {
    val op = new PostgreSQLSourceOpDesc
    op.connectionId = id
    op.table = "facilities"
    op
  }

  private val stubCreds = PostgresJdbcCredentials(
    host = "db.internal",
    port = "5432",
    database = "analytics",
    username = "analyst",
    password = "hunter2"
  )

  private def stubLookup(
      credsById: Map[String, PostgresJdbcCredentials] = Map("7" -> stubCreds)
  ): PostgresConnectionLookup =
    (uid: Int, connectionId: String) => {
      assert(uid == 9)
      credsById.getOrElse(
        connectionId,
        throw new IllegalArgumentException(PostgresConnectionLookup.AddConnectionMessage)
      )
    }

  "LogicalPlan.resolvePostgresConnections" should
    "fill JDBC fields from the lookup without storing them on a missing connectionId" in {
    val op = postgresWithConnection()
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolvePostgresConnections(Some(9), Some(errors), Some(stubLookup()))
    assert(errors.isEmpty)
    op.host shouldBe "db.internal"
    op.port shouldBe "5432"
    op.database shouldBe "analytics"
    op.username shouldBe "analyst"
    op.password shouldBe "hunter2"
    op.connectionId shouldBe "7"
    op.table shouldBe "facilities"
  }

  it should "collect an error when the current user is missing" in {
    val op = postgresWithConnection()
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolvePostgresConnections(None, Some(errors), Some(stubLookup()))
    assert(errors.size == 1)
    assert(errors.head._1 == op.operatorIdentifier)
    assert(errors.head._2.getMessage == PostgreSQLSourceOpDesc.AddConnectionMessage)
    assert(op.password == null)
  }

  it should "rethrow when no errorList is provided" in {
    val op = postgresWithConnection()
    val plan = LogicalPlan(List(op), List.empty)
    intercept[IllegalArgumentException] {
      plan.resolvePostgresConnections(None, None, Some(stubLookup()))
    }.getMessage shouldBe PostgreSQLSourceOpDesc.AddConnectionMessage
  }

  it should "leave a legacy PostgreSQL Source with host/password and no connectionId untouched" in {
    val op = new PostgreSQLSourceOpDesc
    op.host = "legacy.internal"
    op.port = "5432"
    op.database = "old"
    op.username = "user"
    op.password = "plaintext"
    op.table = "t"
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    var lookedUp = false
    val lookup: PostgresConnectionLookup = (_, _) => {
      lookedUp = true
      stubCreds
    }
    plan.resolvePostgresConnections(Some(9), Some(errors), Some(lookup))
    assert(errors.isEmpty)
    assert(!lookedUp)
    op.host shouldBe "legacy.internal"
    op.password shouldBe "plaintext"
  }

  // ---------------------------------------------------------------------------
  // resolveMysqlConnections
  // ---------------------------------------------------------------------------

  private def mysqlWithConnection(id: String = "8"): MySQLSourceOpDesc = {
    val op = new MySQLSourceOpDesc
    op.connectionId = id
    op.table = "orders"
    op
  }

  private val mysqlStubCreds = MysqlJdbcCredentials(
    host = "mysql.internal",
    port = "3306",
    database = "shop",
    username = "reader",
    password = "hunter2"
  )

  private def mysqlStubLookup(
      credsById: Map[String, MysqlJdbcCredentials] = Map("8" -> mysqlStubCreds)
  ): MysqlConnectionLookup =
    (uid: Int, connectionId: String) => {
      assert(uid == 9)
      credsById.getOrElse(
        connectionId,
        throw new IllegalArgumentException(MysqlConnectionLookup.AddConnectionMessage)
      )
    }

  "LogicalPlan.resolveMysqlConnections" should
    "fill JDBC fields from the lookup without storing them on a missing connectionId" in {
    val op = mysqlWithConnection()
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolveMysqlConnections(Some(9), Some(errors), Some(mysqlStubLookup()))
    assert(errors.isEmpty)
    op.host shouldBe "mysql.internal"
    op.port shouldBe "3306"
    op.database shouldBe "shop"
    op.username shouldBe "reader"
    op.password shouldBe "hunter2"
    op.connectionId shouldBe "8"
    op.table shouldBe "orders"
  }

  it should "collect an error when the current user is missing" in {
    val op = mysqlWithConnection()
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolveMysqlConnections(None, Some(errors), Some(mysqlStubLookup()))
    assert(errors.size == 1)
    assert(errors.head._1 == op.operatorIdentifier)
    assert(errors.head._2.getMessage == MySQLSourceOpDesc.AddConnectionMessage)
    assert(op.password == null)
  }

  it should "leave a legacy MySQL Source with host/password and no connectionId untouched" in {
    val op = new MySQLSourceOpDesc
    op.host = "legacy.internal"
    op.port = "3306"
    op.database = "old"
    op.username = "user"
    op.password = "plaintext"
    op.table = "t"
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    var lookedUp = false
    val lookup: MysqlConnectionLookup = (_, _) => {
      lookedUp = true
      mysqlStubCreds
    }
    plan.resolveMysqlConnections(Some(9), Some(errors), Some(lookup))
    assert(errors.isEmpty)
    assert(!lookedUp)
    op.host shouldBe "legacy.internal"
    op.password shouldBe "plaintext"
  }

  // ---------------------------------------------------------------------------
  // resolveSnowflakeConnections
  // ---------------------------------------------------------------------------

  private def snowflakeWithConnection(id: String = "11"): SnowflakeSourceOpDesc = {
    val op = new SnowflakeSourceOpDesc
    op.connectionId = id
    op.table = "ORDERS"
    op
  }

  private val snowflakeStubCreds = SnowflakeJdbcCredentials(
    account = "xy12345.us-east-1",
    warehouse = "COMPUTE_WH",
    database = "ANALYTICS",
    schema = "PUBLIC",
    role = Some("SYSADMIN"),
    username = "reader",
    password = "hunter2"
  )

  private def snowflakeStubLookup(
      credsById: Map[String, SnowflakeJdbcCredentials] = Map("11" -> snowflakeStubCreds)
  ): SnowflakeConnectionLookup =
    (uid: Int, connectionId: String) => {
      assert(uid == 9)
      credsById.getOrElse(
        connectionId,
        throw new IllegalArgumentException(SnowflakeConnectionLookup.AddConnectionMessage)
      )
    }

  "LogicalPlan.resolveSnowflakeConnections" should
    "fill JDBC fields from the lookup without storing them on a missing connectionId" in {
    val op = snowflakeWithConnection()
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolveSnowflakeConnections(Some(9), Some(errors), Some(snowflakeStubLookup()))
    assert(errors.isEmpty)
    op.account shouldBe "xy12345.us-east-1"
    op.warehouse shouldBe "COMPUTE_WH"
    op.database shouldBe "ANALYTICS"
    op.schema shouldBe "PUBLIC"
    op.role shouldBe "SYSADMIN"
    op.username shouldBe "reader"
    op.password shouldBe "hunter2"
    op.connectionId shouldBe "11"
    op.table shouldBe "ORDERS"
  }

  it should "collect an error when the current user is missing" in {
    val op = snowflakeWithConnection()
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    plan.resolveSnowflakeConnections(None, Some(errors), Some(snowflakeStubLookup()))
    assert(errors.size == 1)
    assert(errors.head._1 == op.operatorIdentifier)
    assert(errors.head._2.getMessage == SnowflakeSourceOpDesc.AddConnectionMessage)
    assert(op.password == null)
  }

  it should "leave a Snowflake Source without connectionId untouched" in {
    val op = new SnowflakeSourceOpDesc
    op.table = "ORDERS"
    val plan = LogicalPlan(List(op), List.empty)
    val errors = ArrayBuffer.empty[(OperatorIdentity, Throwable)]
    var lookedUp = false
    val lookup: SnowflakeConnectionLookup = (_, _) => {
      lookedUp = true
      snowflakeStubCreds
    }
    plan.resolveSnowflakeConnections(Some(9), Some(errors), Some(lookup))
    assert(errors.isEmpty)
    assert(!lookedUp)
    assert(op.password == null)
    assert(op.account == null)
  }
}
