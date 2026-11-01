import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, VaultS3Client } from '../shared/s3-client'

const send = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = send
    destroy = vi.fn()
  },
  GetObjectCommand: class {},
  PutObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}))

const CONFIG = {
  region: 'us-east-1',
  bucket: 'kura-test',
  key: 'vault.json',
  accessKeyId: 'AKIATEST',
  secretAccessKey: 'secret123',
}

describe('VaultS3Client.upload', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ ETag: '"new-etag"' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('ETag があれば If-Match で書き込む', async () => {
    const etag = await new VaultS3Client(CONFIG).upload(new Uint8Array([1]), 'etag-a')

    expect(etag).toBe('new-etag')
    const { input } = send.mock.calls[0][0]
    expect(input.IfMatch).toBe('etag-a')
    expect(input.IfNoneMatch).toBeUndefined()
  })

  it.each([null, undefined, ''])('ETag が %j なら新規作成としてだけ書き込む', async (etag) => {
    await new VaultS3Client(CONFIG).upload(new Uint8Array([1]), etag)

    const { input } = send.mock.calls[0][0]
    expect(input.IfNoneMatch).toBe('*')
    expect(input.IfMatch).toBeUndefined()
  })

  it('既にオブジェクトがあって 412 が返ると ConflictError にする', async () => {
    send.mockRejectedValue({ name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } })

    await expect(new VaultS3Client(CONFIG).upload(new Uint8Array([1]), null)).rejects.toThrow(
      ConflictError,
    )
  })
})
