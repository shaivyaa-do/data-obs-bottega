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

package org.apache.texera.common.util

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

import java.nio.charset.StandardCharsets
import javax.crypto.AEADBadTagException

class AesGcmCipherSpec extends AnyFlatSpec with Matchers {

  private val cipher = new AesGcmCipher(AesGcmCipher.keyFromSecret("unit-test-connector-secret"))
  private val password = "super-secret-hunter2"

  "AesGcmCipher" should "round-trip a password" in {
    cipher.decrypt(cipher.encrypt(password)) shouldBe password
  }

  it should "round-trip an empty string" in {
    cipher.decrypt(cipher.encrypt("")) shouldBe ""
  }

  it should "round-trip unicode" in {
    val text = "pāss—密码"
    cipher.decrypt(cipher.encrypt(text)) shouldBe text
  }

  it should "emit a different ciphertext on each encrypt because the IV is random" in {
    val first = cipher.encrypt(password)
    val second = cipher.encrypt(password)
    first should not equal second
    cipher.decrypt(first) shouldBe password
    cipher.decrypt(second) shouldBe password
  }

  it should "not embed the plaintext UTF-8 bytes in the ciphertext" in {
    val blob = cipher.encrypt(password)
    val haystack = new String(blob, StandardCharsets.ISO_8859_1)
    haystack should not include password
    blob.containsSlice(password.getBytes(StandardCharsets.UTF_8)) shouldBe false
  }

  it should "reject decryption with a different key" in {
    val other = new AesGcmCipher(AesGcmCipher.keyFromSecret("other-secret"))
    val blob = cipher.encrypt(password)
    intercept[AEADBadTagException] {
      other.decrypt(blob)
    }
  }

  it should "reject a truncated blob" in {
    intercept[IllegalArgumentException] {
      cipher.decrypt(Array[Byte](1, 2, 3))
    }
  }

  it should "reject a null or empty secret when deriving a key" in {
    intercept[IllegalArgumentException] {
      AesGcmCipher.keyFromSecret("")
    }
    intercept[IllegalArgumentException] {
      AesGcmCipher.keyFromSecret(null)
    }
  }

  it should "reject a key that is not 32 bytes" in {
    intercept[IllegalArgumentException] {
      new AesGcmCipher(Array.fill(16)(1.toByte))
    }
  }
}
