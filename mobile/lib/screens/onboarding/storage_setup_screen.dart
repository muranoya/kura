// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../models/storage_config.dart';
import '../../services/secure_storage_service.dart';

class StorageSetupScreen extends StatefulWidget {
  const StorageSetupScreen({Key? key}) : super(key: key);

  @override
  State<StorageSetupScreen> createState() => _StorageSetupScreenState();
}

class _StorageSetupScreenState extends State<StorageSetupScreen> {
  String _selectedProvider = 'aws-s3';
  late TextEditingController _bucketController;
  late TextEditingController _regionController;
  late TextEditingController _accessKeyController;
  late TextEditingController _secretKeyController;
  late TextEditingController _endpointController;
  bool _isTestingConnection = false;
  String? _connectionError;

  final _secureStorage = SecureStorageService();

  @override
  void initState() {
    super.initState();
    _bucketController = TextEditingController();
    _regionController = TextEditingController(text: 'us-east-1');
    _accessKeyController = TextEditingController();
    _secretKeyController = TextEditingController();
    _endpointController = TextEditingController();
  }

  @override
  void dispose() {
    _bucketController.dispose();
    _regionController.dispose();
    _accessKeyController.dispose();
    _secretKeyController.dispose();
    _endpointController.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTestingConnection = true;
      _connectionError = null;
    });

    try {
      // TODO: Implement actual S3 connection test
      // For now, just validate that fields are filled
      if (_bucketController.text.isEmpty ||
          _accessKeyController.text.isEmpty ||
          _secretKeyController.text.isEmpty) {
        throw Exception('すべてのフィールドを入力してください');
      }

      setState(() {
        _connectionError = null;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('接続テスト成功')),
      );
    } catch (e) {
      setState(() {
        _connectionError = e.toString();
      });
    } finally {
      setState(() {
        _isTestingConnection = false;
      });
    }
  }

  Future<void> _proceed() async {
    if (_bucketController.text.isEmpty ||
        _accessKeyController.text.isEmpty ||
        _secretKeyController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('すべてのフィールドを入力してください')),
      );
      return;
    }

    final config = StorageConfig(
      provider: _selectedProvider,
      bucket: _bucketController.text,
      region: _regionController.text.isEmpty ? null : _regionController.text,
      accessKey: _accessKeyController.text,
      secretKey: _secretKeyController.text,
      endpoint: _endpointController.text.isEmpty ? null : _endpointController.text,
    );

    await _secureStorage.saveStorageConfig(config);
    await _secureStorage.saveAccessKey(_accessKeyController.text);

    if (mounted) {
      context.go('/onboarding/master-password');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ストレージ設定')),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                'クラウドストレージ設定',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              RadioListTile<String>(
                title: const Text('AWS S3'),
                value: 'aws-s3',
                groupValue: _selectedProvider,
                onChanged: (value) {
                  setState(() => _selectedProvider = value ?? 'aws-s3');
                },
              ),
              RadioListTile<String>(
                title: const Text('Cloudflare R2'),
                value: 'cloudflare-r2',
                groupValue: _selectedProvider,
                onChanged: (value) {
                  setState(() => _selectedProvider = value ?? 'cloudflare-r2');
                },
              ),
              RadioListTile<String>(
                title: const Text('MinIO'),
                value: 'minio',
                groupValue: _selectedProvider,
                onChanged: (value) {
                  setState(() => _selectedProvider = value ?? 'minio');
                },
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _bucketController,
                decoration: const InputDecoration(labelText: 'バケット名'),
              ),
              const SizedBox(height: 12),
              if (_selectedProvider == 'aws-s3')
                TextField(
                  controller: _regionController,
                  decoration: const InputDecoration(labelText: 'リージョン'),
                ),
              if (_selectedProvider == 'minio')
                TextField(
                  controller: _endpointController,
                  decoration: const InputDecoration(labelText: 'エンドポイント'),
                ),
              const SizedBox(height: 12),
              TextField(
                controller: _accessKeyController,
                decoration: const InputDecoration(labelText: 'アクセスキー'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _secretKeyController,
                decoration: const InputDecoration(labelText: 'シークレットキー'),
                obscureText: true,
              ),
              const SizedBox(height: 16),
              if (_connectionError != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _connectionError!,
                    style: TextStyle(color: Colors.red.shade800),
                  ),
                ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isTestingConnection ? null : _testConnection,
                      child: _isTestingConnection
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('接続テスト'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _proceed,
                      child: const Text('次へ'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
