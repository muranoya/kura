pub mod s3_sigv4;
#[cfg(target_arch = "wasm32")]
pub mod s3_wasm;
#[cfg(target_arch = "wasm32")]
pub use s3_wasm::WasmS3Storage;
