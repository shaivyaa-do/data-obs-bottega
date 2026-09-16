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

package org.apache.texera.service.util

import java.sql.{DriverManager, SQLException}

/**
  * Opens a MySQL JDBC connection and runs `SELECT 1`. Password is passed to
  * [[DriverManager.getConnection]] as a parameter, never as a URL query
  * string, so it is not copied into the URL that exceptions might echo.
  */
object MysqlJdbcTester extends JdbcSelectOne with JdbcListTables {

  def buildJdbcUrl(host: String, port: Int, database: String): String =
    s"jdbc:mysql://$host:$port/$database?autoReconnect=true&useSSL=true"

  override def selectOne(url: String, username: String, password: String): Unit = {
    withConnection(url, username, password) { conn =>
      val stmt = conn.createStatement()
      try {
        val rs = stmt.executeQuery("SELECT 1")
        try {
          if (!rs.next()) throw new SQLException("SELECT 1 returned no row")
        } finally rs.close()
      } finally stmt.close()
    }
  }

  override def listTables(
      url: String,
      username: String,
      password: String,
      schema: String
  ): Seq[String] = {
    withConnection(url, username, password) { conn =>
      val stmt = conn.prepareStatement(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name"
      )
      try {
        stmt.setString(1, schema)
        val rs = stmt.executeQuery()
        try {
          val names = List.newBuilder[String]
          while (rs.next()) {
            names += rs.getString(1)
          }
          names.result()
        } finally rs.close()
      } finally stmt.close()
    }
  }

  private def withConnection[T](url: String, username: String, password: String)(
      body: java.sql.Connection => T
  ): T = {
    Class.forName("com.mysql.cj.jdbc.Driver")
    DriverManager.setLoginTimeout(5)
    val conn = DriverManager.getConnection(url, username, password)
    try body(conn)
    finally conn.close()
  }
}
