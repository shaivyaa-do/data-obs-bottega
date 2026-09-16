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

import org.apache.texera.amber.core.tuple.AttributeType
import org.apache.texera.amber.operator.source.sql.SQLSourceOpExec
import org.apache.texera.amber.operator.source.sql.snowflake.SnowflakeConnUtil.connect
import org.apache.texera.amber.util.JSONUtils.objectMapper

import java.sql._

class SnowflakeSourceOpExec private[snowflake] (
    descString: String
) extends SQLSourceOpExec(descString) {
  override val desc: SnowflakeSourceOpDesc =
    objectMapper.readValue(descString, classOf[SnowflakeSourceOpDesc])
  schema = desc.sourceSchema()

  def fetchTablesSql: String =
    SnowflakeConnUtil.showTablesSql(
      desc.database,
      SnowflakeConnUtil.schemaOrPublic(desc.schema)
    )

  @throws[SQLException]
  override def establishConn(): Connection =
    connect(
      desc.account,
      desc.warehouse,
      desc.database,
      desc.schema,
      Option(desc.role).map(_.trim).filter(_.nonEmpty),
      desc.username,
      desc.password
    )

  @throws[RuntimeException]
  override def addFilterConditions(queryBuilder: StringBuilder): Unit = {
    val keywordSearchByColumn = desc.keywordSearchByColumn.orNull
    if (
      desc.keywordSearch.getOrElse(false) && keywordSearchByColumn != null && desc.keywords != null
    ) {
      val columnType = schema.getAttribute(keywordSearchByColumn).getType

      if (columnType == AttributeType.STRING)
        queryBuilder ++= " AND " + SnowflakeConnUtil.quoteIdent(keywordSearchByColumn) +
          " ILIKE ('%' || ? || '%')"
      else
        throw new RuntimeException("Can't do keyword search on type " + columnType.toString)
    }
  }

  override protected def addBaseSelect(queryBuilder: StringBuilder): Unit =
    queryBuilder ++= "\nSELECT * FROM " + SnowflakeConnUtil.qualifiedTable(
      desc.schema,
      desc.table
    ) + " where 1 = 1"

  @throws[SQLException]
  override protected def loadTableNames(): Unit = {
    val statement = connection.createStatement()
    val resultSet = statement.executeQuery(fetchTablesSql)
    while ({
      resultSet.next
    }) {
      tableNames += resultSet.getString("name")
    }
    resultSet.close()
    statement.close()
  }
}
