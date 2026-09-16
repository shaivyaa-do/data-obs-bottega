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

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class MysqlJdbcTesterSpec extends AnyFlatSpec with Matchers {

  "buildJdbcUrl" should "render host, port, and database with the MySQL JDBC options and omit credentials" in {
    val url = MysqlJdbcTester.buildJdbcUrl("db.example", 3306, "analytics")
    url shouldBe "jdbc:mysql://db.example:3306/analytics?autoReconnect=true&useSSL=true"
    url.toLowerCase should not include "password"
    url.toLowerCase should not include "user="
  }

  it should "not put the password into the URL even when the database name looks like one" in {
    val url = MysqlJdbcTester.buildJdbcUrl("localhost", 3306, "secret")
    url shouldBe "jdbc:mysql://localhost:3306/secret?autoReconnect=true&useSSL=true"
  }
}
