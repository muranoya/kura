//! QR コードの生成（設定の転送コード）と読み取り（TOTP の QR 画像）

use slint::{Image, Rgba8Pixel, SharedPixelBuffer};

/// QR コードを白背景・黒モジュールの画像にする（4モジュールのクワイエットゾーン付き）
pub fn render(data: &str) -> Result<Image, String> {
    let code = qrcode::QrCode::new(data.as_bytes()).map_err(|e| e.to_string())?;
    let modules = code.width();
    let colors = code.to_colors();
    const SCALE: usize = 4;
    const QUIET: usize = 4;
    let size = (modules + QUIET * 2) * SCALE;
    let mut buffer = SharedPixelBuffer::<Rgba8Pixel>::new(size as u32, size as u32);
    let pixels = buffer.make_mut_slice();
    for (y, row) in pixels.chunks_mut(size).enumerate() {
        for (x, pixel) in row.iter_mut().enumerate() {
            let mx = (x / SCALE).wrapping_sub(QUIET);
            let my = (y / SCALE).wrapping_sub(QUIET);
            let dark =
                mx < modules && my < modules && colors[my * modules + mx] == qrcode::Color::Dark;
            let v = if dark { 0 } else { 255 };
            *pixel = Rgba8Pixel {
                r: v,
                g: v,
                b: v,
                a: 255,
            };
        }
    }
    Ok(Image::from_rgba8(buffer))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecodeError {
    /// 画像から QR コードを検出できなかった
    NoQr,
    /// QR コードが空だった
    Empty,
    /// TOTP シークレットまたは otpauth URI ではなかった
    InvalidTotp,
}

impl DecodeError {
    pub fn message(self) -> &'static str {
        match self {
            DecodeError::NoQr => "画像からQRコードを検出できませんでした",
            DecodeError::Empty => "QRコードが空でした",
            DecodeError::InvalidTotp => "TOTPシークレットまたは otpauth URI ではありません",
        }
    }
}

/// 画像ファイルの中から最初に見つかった QR コードの内容を返す
pub fn decode(image_bytes: &[u8]) -> Result<String, DecodeError> {
    let img = image::load_from_memory(image_bytes).map_err(|_| DecodeError::NoQr)?;
    let mut prepared = rqrr::PreparedImage::prepare(img.to_luma8());
    prepared
        .detect_grids()
        .into_iter()
        .find_map(|grid| grid.decode().ok().map(|(_, content)| content))
        .ok_or(DecodeError::NoQr)
}

/// QR 画像を読み取り、TOTP として使える値か `validate` で確かめる
pub fn decode_totp(
    image_bytes: &[u8],
    validate: impl FnOnce(&str) -> Result<(), String>,
) -> Result<String, DecodeError> {
    let payload = decode(image_bytes)?;
    let value = payload.trim();
    if value.is_empty() {
        return Err(DecodeError::Empty);
    }
    validate(value).map_err(|_| DecodeError::InvalidTotp)?;
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn qr_png(data: &str) -> Vec<u8> {
        let code = qrcode::QrCode::new(data.as_bytes()).unwrap();
        let modules = code.width();
        let colors = code.to_colors();
        let scale = 8;
        let quiet = 4;
        let size = ((modules + quiet * 2) * scale) as u32;
        let img = image::GrayImage::from_fn(size, size, |x, y| {
            let mx = (x as usize / scale).wrapping_sub(quiet);
            let my = (y as usize / scale).wrapping_sub(quiet);
            let dark =
                mx < modules && my < modules && colors[my * modules + mx] == qrcode::Color::Dark;
            image::Luma([if dark { 0 } else { 255 }])
        });
        let mut out = std::io::Cursor::new(Vec::new());
        img.write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn decodes_generated_qr() {
        let uri = "otpauth://totp/kura:test?secret=JBSWY3DPEHPK3PXP&issuer=kura";
        assert_eq!(decode(&qr_png(uri)).unwrap(), uri);
    }

    #[test]
    fn decode_totp_trims_and_validates() {
        let png = qr_png("  JBSWY3DPEHPK3PXP  ");
        assert_eq!(decode_totp(&png, |_| Ok(())).unwrap(), "JBSWY3DPEHPK3PXP");
        assert_eq!(
            decode_totp(&png, |_| Err("bad".into())),
            Err(DecodeError::InvalidTotp)
        );
    }

    #[test]
    fn rejects_non_images() {
        assert_eq!(decode(b"not an image"), Err(DecodeError::NoQr));
    }
}
