package com.kura.app.data.s3

import android.util.Log
import aws.sdk.kotlin.runtime.auth.credentials.StaticCredentialsProvider
import aws.sdk.kotlin.services.s3.S3Client
import aws.sdk.kotlin.services.s3.model.GetObjectRequest
import aws.sdk.kotlin.services.s3.model.NoSuchKey
import aws.sdk.kotlin.services.s3.model.PutObjectRequest
import aws.sdk.kotlin.services.s3.model.S3Exception
import aws.smithy.kotlin.runtime.content.ByteStream
import aws.smithy.kotlin.runtime.content.toByteArray
import aws.smithy.kotlin.runtime.net.url.Url
import com.kura.app.data.model.S3Config

class ConflictException : Exception("Remote vault was modified (412 Precondition Failed)")

class VaultS3Client(private val config: S3Config) {
    companion object {
        private const val TAG = "VaultS3Client"
    }

    private fun buildClient(): S3Client {
        return S3Client {
            region = config.region
            credentialsProvider = StaticCredentialsProvider {
                accessKeyId = config.accessKeyId
                secretAccessKey = config.secretAccessKey
            }
            if (config.endpoint != null) {
                val ep = config.endpoint.let {
                    if (it.startsWith("http://") || it.startsWith("https://")) it
                    else "https://$it"
                }
                endpointUrl = Url.parse(ep)
                forcePathStyle = true
            }
        }
    }

    suspend fun download(): Pair<ByteArray, String>? {
        Log.d(TAG, "download: bucket=${config.bucket}, key=${config.key}, region=${config.region}")
        val client = buildClient()
        try {
            val request = GetObjectRequest {
                bucket = config.bucket
                key = config.key.ifBlank { "vault.json" }
            }

            return client.getObject(request) { response ->
                val data = response.body?.toByteArray()
                    ?: throw RuntimeException("Empty response body from S3")

                val etag = response.eTag
                    ?.trim('"')
                    ?: ""

                Log.d(TAG, "download: success, size=${data.size}, etag=$etag")
                Pair(data, etag)
            }
        } catch (_: NoSuchKey) {
            Log.d(TAG, "download: NoSuchKey, returning null")
            return null
        } catch (e: S3Exception) {
            val code = e.sdkErrorMetadata.errorCode
            Log.e(TAG, "download: S3Exception code=$code", e)
            if (code == "NoSuchKey" || code == "404") {
                return null
            }
            throw RuntimeException("S3 download failed: [${code}] ${e.message ?: e.toString()}", e)
        } catch (e: Exception) {
            Log.e(TAG, "download: Exception type=${e.javaClass.name}", e)
            throw RuntimeException("S3 download failed: ${e.message ?: e.toString()}", e)
        } finally {
            client.close()
        }
    }

    suspend fun upload(data: ByteArray, etag: String?): String {
        val client = buildClient()
        try {
            val request = PutObjectRequest {
                bucket = config.bucket
                key = config.key.ifBlank { "vault.json" }
                body = ByteStream.fromBytes(data)
                if (!etag.isNullOrBlank()) {
                    ifMatch = etag
                }
            }

            val response = client.putObject(request)
            return response.eTag
                ?.trim('"')
                ?: ""
        } catch (e: S3Exception) {
            val code = e.sdkErrorMetadata.errorCode
            if (code == "PreconditionFailed") {
                throw ConflictException()
            }
            throw RuntimeException("S3 upload failed: [${code}] ${e.message ?: e.toString()}", e)
        } catch (e: Exception) {
            throw RuntimeException("S3 upload failed: ${e.message ?: e.toString()}", e)
        } finally {
            client.close()
        }
    }
}
