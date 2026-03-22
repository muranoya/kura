class StorageConfig {
  final String provider; // "aws-s3" | "cloudflare-r2" | "minio"
  final String bucket;
  final String accessKey;
  final String secretKey;
  final String? region; // For AWS S3
  final String? endpoint; // For MinIO

  const StorageConfig({
    required this.provider,
    required this.bucket,
    required this.accessKey,
    required this.secretKey,
    this.region,
    this.endpoint,
  });

  Map<String, dynamic> toJson() => {
    'provider': provider,
    'bucket': bucket,
    'accessKey': accessKey,
    'secretKey': secretKey,
    'region': region,
    'endpoint': endpoint,
  };

  factory StorageConfig.fromJson(Map<String, dynamic> json) => StorageConfig(
    provider: json['provider'] as String,
    bucket: json['bucket'] as String,
    accessKey: json['accessKey'] as String,
    secretKey: json['secretKey'] as String,
    region: json['region'] as String?,
    endpoint: json['endpoint'] as String?,
  );
}
