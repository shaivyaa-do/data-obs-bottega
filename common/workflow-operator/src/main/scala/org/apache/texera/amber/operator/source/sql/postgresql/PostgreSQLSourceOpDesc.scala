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

package org.apache.texera.amber.operator.source.sql.postgresql

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
import org.apache.texera.amber.operator.source.sql.postgresql.PostgreSQLConnUtil.connect
import org.apache.texera.amber.util.JSONUtils.objectMapper

import java.sql.{Connection, SQLException}

object PostgreSQLSourceOpDesc {
  val AddConnectionMessage: String =
    "Add a PostgreSQL connection under Connectors."
}

@JsonPropertyOrder(Array("connectionId", "table"))
class PostgreSQLSourceOpDesc extends SQLSourceOpDesc {

  @JsonProperty()
  @JsonSchemaTitle("Connection")
  @JsonPropertyDescription("Saved PostgreSQL connection from Connectors")
  var connectionId: String = _

  @JsonProperty()
  @JsonSchemaTitle("Keywords to Search")
  @JsonDeserialize(contentAs = classOf[java.lang.String])
  @JsonSchemaInject(json = UIWidget.UIWidgetTextArea)
  @JsonPropertyDescription(
    "E.g. 'sore & throat' for AND; 'sore', 'throat' for OR. See official postgres documents for details."
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
        operatorIdentifier,
        OpExecWithClassName(
          "org.apache.texera.amber.operator.source.sql.postgresql.PostgreSQLSourceOpExec",
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
      "PostgreSQL Source",
      "Read data from a PostgreSQL instance",
      OperatorGroupConstants.DATABASE_GROUP,
      inputPorts = List.empty,
      outputPorts = List(OutputPort())
    )

  @throws[SQLException]
  override def establishConn: Connection = connect(host, port, database, username, password)

  override def sourceSchema(): Schema = {
    if (!hasResolvedJdbc) {
      throw new IllegalArgumentException(PostgreSQLSourceOpDesc.AddConnectionMessage)
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
    port = if (port.trim().equals("default")) "5432" else port
}
