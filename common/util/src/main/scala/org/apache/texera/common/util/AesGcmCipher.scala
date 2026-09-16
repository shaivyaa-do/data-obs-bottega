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

import java.nio.charset.StandardCharsets
import java.security.{MessageDigest, SecureRandom}
import javax.crypto.Cipher
import javax.crypto.spec.{GCMParameterSpec, SecretKeySpec}

/**
  * AES-256-GCM with a random 12-byte IV prepended to the ciphertext. The caller
  * supplies 32 key bytes (typically SHA-256 of a passphrase); this class never
  * reads environment variables or logs plaintext.
  */
object AesGcmCipher {
  val IvLengthBytes: Int = 12
  val TagBits: Int = 128
  val KeyLengthBytes: Int = 32

  def keyFromSecret(secret: String): Array[Byte] = {
    require(secret != null && secret.nonEmpty, "secret must be non-empty")
    MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8))
  }
}

final class AesGcmCipher(keyBytes: Array[Byte]) {
  require(
    keyBytes != null && keyBytes.length == AesGcmCipher.KeyLengthBytes,
    s"AES-256 key must be ${AesGcmCipher.KeyLengthBytes} bytes"
  )

  private val key = new SecretKeySpec(keyBytes.clone(), "AES")
  private val random = new SecureRandom()

  def encrypt(plaintext: String): Array[Byte] = {
    require(plaintext != null, "plaintext must not be null")
    val iv = new Array[Byte](AesGcmCipher.IvLengthBytes)
    random.nextBytes(iv)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(AesGcmCipher.TagBits, iv))
    val ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8))
    iv ++ ciphertext
  }

  def decrypt(blob: Array[Byte]): String = {
    require(
      blob != null && blob.length > AesGcmCipher.IvLengthBytes,
      "ciphertext is too short"
    )
    val iv = blob.slice(0, AesGcmCipher.IvLengthBytes)
    val ciphertext = blob.slice(AesGcmCipher.IvLengthBytes, blob.length)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(AesGcmCipher.TagBits, iv))
    new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
  }
}
