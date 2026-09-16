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

package org.apache.texera.amber.operator.source.sql.mysql

import com.fasterxml.jackson.annotation.{JsonProperty, JsonPropertyDescription, JsonPropertyOrder}
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import com.kjetland.jackson.jsonSchema.annotations.{JsonSchemaInject, JsonSchemaTitle}
import org.apache.texera.amber.core.executor.OpExecWithClassName
import org.apache.texera.amber.core.tuple.Schema
import org.apache.texera.amber.core.virtualidentity.{ExecutionIdentity, WorkflowIdentity}
import org.apache.texera.amber.core.workflow.{OutputPort, PhysicalOp, SchemaPropagationFunc}
import org.apache.texera.amber.operator.metadata.annotations.UIWidget
import org.apache.texera.amber.operator.metadata.{OperatorGroupConstants, OperatorInfo}
import org.apache.texera.amber.operator.source.sql.SQLSourceOpDesc
import org.apache.texera.amber.operator.source.sql.mysql.MySQLConnUtil.connect
import org.apache.texera.amber.util.JSONUtils.objectMapper

import java.sql.{Connection, SQLException}

object MySQLSourceOpDesc {
  val AddConnectionMessage: String =
    "Add a MySQL connection under Connectors."
}

@JsonPropertyOrder(Array("connectionId", "table"))
class MySQLSourceOpDesc extends SQLSourceOpDesc {

  @JsonProperty()
  @JsonSchemaTitle("Connection")
  @JsonPropertyDescription("Saved MySQL connection from Connectors")
  var connectionId: String = _

  @JsonProperty()
  @JsonSchemaTitle("Keywords to Search")
  @JsonDeserialize(contentAs = classOf[java.lang.String])
  @JsonSchemaInject(json = UIWidget.UIWidgetTextArea)
  @JsonPropertyDescription(
    "E.g. '+MySQL -InnoDB' for boolean mode. See official MySQL documents for details."
  )
  override def getKeywords: Option[String] = super.getKeywords

  override def getPhysicalOp(
      workflowId: WorkflowIdentity,
      executionId: ExecutionIdentity
  ): PhysicalOp =
    PhysicalOp
      .sourcePhysicalOp(
        workflowId,
        executionId,
        this.operatorIdentifier,
        OpExecWithClassName(
          "org.apache.texera.amber.operator.source.sql.mysql.MySQLSourceOpExec",
          objectMapper.writeValueAsString(this)
        )
      )
      .withInputPorts(operatorInfo.inputPorts)
      .withOutputPorts(operatorInfo.outputPorts)
      .withPropagateSchema(
        SchemaPropagationFunc(_ => Map(operatorInfo.outputPorts.head.id -> sourceSchema()))
      )

  override def operatorInfo: OperatorInfo =
    OperatorInfo(
      "MySQL Source",
      "Read data from a MySQL instance",
      OperatorGroupConstants.DATABASE_GROUP,
      inputPorts = List.empty,
      outputPorts = List(OutputPort())
    )

  @throws[SQLException]
  override def establishConn: Connection = connect(host, port, database, username, password)

  override def sourceSchema(): Schema = {
    if (!hasResolvedJdbc) {
      throw new IllegalArgumentException(MySQLSourceOpDesc.AddConnectionMessage)
    }
    super.sourceSchema()
  }

  def hasConnectionId: Boolean =
    connectionId != null && connectionId.trim.nonEmpty

  def hasResolvedJdbc: Boolean =
    nonEmpty(host) && nonEmpty(port) && nonEmpty(database) && nonEmpty(username) && nonEmpty(
      password
    )

  def applyJdbcCredentials(
      host: String,
      port: String,
      database: String,
      username: String,
      password: String
  ): Unit = {
    this.host = host
    this.port = port
    this.database = database
    this.username = username
    this.password = password
  }

  private def nonEmpty(value: String): Boolean =
    value != null && value.trim.nonEmpty

  override protected def updatePort(): Unit =
    port = if (port.trim().equals("default")) "3306" else port
}
