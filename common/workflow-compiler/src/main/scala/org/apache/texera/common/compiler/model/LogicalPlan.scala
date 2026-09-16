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

package org.apache.texera.common.compiler.model

import com.typesafe.scalalogging.LazyLogging
import org.apache.texera.amber.core.storage.FileResolver
import org.apache.texera.amber.core.virtualidentity.OperatorIdentity
import org.apache.texera.amber.operator.LogicalOp
import org.apache.texera.amber.operator.source.scan.ScanSourceOpDesc
import org.apache.texera.amber.operator.source.sql.mysql.MySQLSourceOpDesc
import org.apache.texera.amber.operator.source.sql.postgresql.PostgreSQLSourceOpDesc
import org.apache.texera.common.compiler.mysql.MysqlConnectionLookup
import org.apache.texera.common.compiler.postgres.PostgresConnectionLookup
import org.jgrapht.graph.DirectedAcyclicGraph
import org.jgrapht.util.SupplierUtil

import java.util
import scala.collection.mutable.ArrayBuffer
import scala.util.{Failure, Success, Try}

object LogicalPlan {

  private def toJgraphtDAG(
      operatorList: List[LogicalOp],
      links: List[LogicalLink]
  ): DirectedAcyclicGraph[OperatorIdentity, LogicalLink] = {
    val workflowDag =
      new DirectedAcyclicGraph[OperatorIdentity, LogicalLink](
        null, // vertexSupplier
        SupplierUtil.createSupplier(classOf[LogicalLink]), // edgeSupplier
        false, // weighted
        true // allowMultipleEdges
      )
    operatorList.foreach(op => workflowDag.addVertex(op.operatorIdentifier))
    links.foreach(l =>
      workflowDag.addEdge(
        l.fromOpId,
        l.toOpId,
        l
      )
    )
    workflowDag
  }

  def apply(
      pojo: LogicalPlanPojo
  ): LogicalPlan = {
    LogicalPlan(pojo.operators, pojo.links)
  }
}

case class LogicalPlan(
    operators: List[LogicalOp],
    links: List[LogicalLink]
) extends LazyLogging {

  private lazy val operatorMap: Map[OperatorIdentity, LogicalOp] =
    operators.map(op => (op.operatorIdentifier, op)).toMap

  private lazy val jgraphtDag: DirectedAcyclicGraph[OperatorIdentity, LogicalLink] =
    LogicalPlan.toJgraphtDAG(operators, links)

  def getTopologicalOpIds: util.Iterator[OperatorIdentity] = jgraphtDag.iterator()

  def getOperator(opId: OperatorIdentity): LogicalOp = operatorMap(opId)

  def getTerminalOperatorIds: List[OperatorIdentity] =
    operatorMap.keys
      .filter(op => jgraphtDag.outDegreeOf(op) == 0)
      .toList

  def getUpstreamLinks(opId: OperatorIdentity): List[LogicalLink] = {
    links.filter(l => l.toOpId == opId)
  }

  /**
    * Resolves each scan source operator's user-given file name to a URI and sets it on the
    * operator via `setResolvedFileName`.
    *
    * @param errorList if given, errors encountered during resolution are appended to it;
    *                  otherwise the first error is thrown
    */
  def resolveScanSourceOpFileName(
      errorList: Option[ArrayBuffer[(OperatorIdentity, Throwable)]]
  ): Unit = {
    operators.foreach {
      case operator @ (scanOp: ScanSourceOpDesc) =>
        Try {
          // Resolve file path for ScanSourceOpDesc
          val fileName = scanOp.fileName.getOrElse(
            throw new RuntimeException(
              "No file selected. Please select a file from the 'File' dropdown in the right panel."
            )
          )
          val fileUri = FileResolver.resolve(fileName) // Convert to URI

          // Set the URI in the ScanSourceOpDesc
          scanOp.setResolvedFileName(fileUri)
        } match {
          case Success(_) => // Successfully resolved and set the file URI

          case Failure(err) =>
            logger.error("Error resolving file path for ScanSourceOpDesc", err)
            errorList match {
              case Some(errList) =>
                errList.append((operator.operatorIdentifier, err))
              case None =>
                // Throw the error if no errorList is provided
                throw err
            }
        }

      case _ => // Skip non-ScanSourceOpDesc operators
    }
  }

  /**
    * Fills JDBC fields on each PostgreSQL Source that stores a `connectionId` by looking up
    * `connection_cred` for the current user. Mutates operators in memory only — the saved
    * workflow.content keeps connectionId + table, not the password.
    *
    * @param uid       current user; missing uid fails any op that has a connectionId
    * @param errorList if given, errors are appended; otherwise the first error is thrown
    * @param lookup    injectable so unit tests do not need texera_db
    */
  def resolvePostgresConnections(
      uid: Option[Int],
      errorList: Option[ArrayBuffer[(OperatorIdentity, Throwable)]],
      lookup: Option[PostgresConnectionLookup] = None
  ): Unit = {
    operators.foreach {
      case operator: PostgreSQLSourceOpDesc if operator.hasConnectionId =>
        val resolver = lookup.getOrElse(PostgresConnectionLookup.default)
        Try {
          val userId = uid.getOrElse(
            throw new IllegalArgumentException(PostgreSQLSourceOpDesc.AddConnectionMessage)
          )
          val creds = resolver.resolve(userId, operator.connectionId)
          operator.applyJdbcCredentials(
            creds.host,
            creds.port,
            creds.database,
            creds.username,
            creds.password
          )
        } match {
          case Success(_) =>
          case Failure(err) =>
            logger.error("Error resolving PostgreSQL connection", err)
            errorList match {
              case Some(errList) =>
                errList.append((operator.operatorIdentifier, err))
              case None =>
                throw err
            }
        }
      case _ =>
    }
  }

  /**
    * Fills JDBC fields on each MySQL Source that stores a `connectionId` by looking up
    * `connection_cred` for the current user. Mutates operators in memory only — the saved
    * workflow.content keeps connectionId + table, not the password.
    */
  def resolveMysqlConnections(
      uid: Option[Int],
      errorList: Option[ArrayBuffer[(OperatorIdentity, Throwable)]],
      lookup: Option[MysqlConnectionLookup] = None
  ): Unit = {
    operators.foreach {
      case operator: MySQLSourceOpDesc if operator.hasConnectionId =>
        val resolver = lookup.getOrElse(MysqlConnectionLookup.default)
        Try {
          val userId = uid.getOrElse(
            throw new IllegalArgumentException(MySQLSourceOpDesc.AddConnectionMessage)
          )
          val creds = resolver.resolve(userId, operator.connectionId)
          operator.applyJdbcCredentials(
            creds.host,
            creds.port,
            creds.database,
            creds.username,
            creds.password
          )
        } match {
          case Success(_) =>
          case Failure(err) =>
            logger.error("Error resolving MySQL connection", err)
            errorList match {
              case Some(errList) =>
                errList.append((operator.operatorIdentifier, err))
              case None =>
                throw err
            }
        }
      case _ =>
    }
  }
}
