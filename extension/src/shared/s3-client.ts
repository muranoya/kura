import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import type { S3Config } from './types'

export class ConflictError extends Error {
  constructor() {
    super('ConflictDetected')
    this.name = 'ConflictError'
  }
}

export class VaultS3Client {
  private client: S3Client
  private bucket: string
  private key: string

  constructor(config: S3Config) {
    const clientConfig: S3ClientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint
      clientConfig.forcePathStyle = true
    }

    this.client = new S3Client(clientConfig)
    this.bucket = config.bucket
    this.key = config.key
  }

  async download(): Promise<{ bytes: Uint8Array; etag: string } | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
        }),
      )

      const body = await response.Body?.transformToByteArray()
      if (!body) throw new Error('Empty response body from S3')

      const etag = response.ETag?.replace(/"/g, '') ?? ''

      return { bytes: body, etag }
    } catch (err: unknown) {
      if (isS3Error(err, 'NoSuchKey', 404)) return null
      throw new Error(`S3 download failed: ${String(err)}`)
    }
  }

  async upload(data: Uint8Array, etag?: string | null): Promise<string> {
    try {
      const params: ConstructorParameters<typeof PutObjectCommand>[0] = {
        Bucket: this.bucket,
        Key: this.key,
        Body: data,
      }

      if (etag) {
        params.IfMatch = etag
      }

      const response = await this.client.send(new PutObjectCommand(params))
      return response.ETag?.replace(/"/g, '') ?? ''
    } catch (err: unknown) {
      if (isS3Error(err, 'PreconditionFailed', 412)) throw new ConflictError()
      throw new Error(`S3 upload failed: ${String(err)}`)
    }
  }

  destroy() {
    this.client.destroy()
  }
}

function isS3Error(err: unknown, code: string, statusCode: number): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as Record<string, unknown>
  const meta = e.$metadata as Record<string, unknown> | undefined
  return e.name === code || e.Code === code || meta?.httpStatusCode === statusCode
}
