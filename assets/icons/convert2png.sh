#!/bin/bash

# assets/icons/ からの相対パスでプロジェクトルートを特定
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# SVG→PNG変換コマンドを検出
if command -v magick &>/dev/null; then
  SVG2PNG="magick"
elif command -v convert &>/dev/null; then
  SVG2PNG="convert"
else
  echo "Error: ImageMagick (magick or convert) is required" >&2
  exit 1
fi

# SVG→PNG変換関数（高解像度ラスタライズ対応）
# ImageMagickはSVGをまず元のサイズでラスタライズしてからリサイズするため、
# -density で高DPIを指定してラスタライズ品質を確保する
svg2png() {
  local input="$1" output="$2" size="$3"
  $SVG2PNG -density 1200 -background none "$input" -resize ${size}x${size} -depth 8 "$output"
}

# --- Extension ---
EXT_ICON_DIR="$PROJECT_ROOT/extension/public/icons"
EXT_SIZES=(16 48 128)

mkdir -p "$EXT_ICON_DIR"
for size in "${EXT_SIZES[@]}"; do
  svg2png "$SCRIPT_DIR/locked_icon.svg" "$EXT_ICON_DIR/locked-${size}.png" "$size"
  svg2png "$SCRIPT_DIR/unlocked_icon.svg" "$EXT_ICON_DIR/unlocked-${size}.png" "$size"
  echo "Extension: ${size}x${size}"
done

# --- Desktop (Tauri) ---
# アプリアイコンは `pnpm tauri icon assets/icons/locked_icon.svg` で生成する。
# ここではトレイアイコン用の locked/unlocked のみ生成する。
DESKTOP_ICON_DIR="$PROJECT_ROOT/desktop/src-tauri/icons"

mkdir -p "$DESKTOP_ICON_DIR"
svg2png "$SCRIPT_DIR/locked_icon.svg" "$DESKTOP_ICON_DIR/locked.png" 512
svg2png "$SCRIPT_DIR/unlocked_icon.svg" "$DESKTOP_ICON_DIR/unlocked.png" 512
echo "Desktop tray icons: 512x512"

# --- Android (mipmap) ---
declare -A ANDROID_DENSITIES=(
  [mdpi]=48
  [hdpi]=72
  [xhdpi]=96
  [xxhdpi]=144
  [xxxhdpi]=192
)

for density in "${!ANDROID_DENSITIES[@]}"; do
  size=${ANDROID_DENSITIES[$density]}
  dir="$PROJECT_ROOT/android/app/src/main/res/mipmap-${density}"
  mkdir -p "$dir"
  svg2png "$SCRIPT_DIR/unlocked_icon.svg" "$dir/ic_launcher.png" "$size"
  echo "Android ($density): ${size}x${size}"
done

# --- Android Adaptive Icon Foreground ---
declare -A ADAPTIVE_SIZES=(
  [mdpi]=108
  [hdpi]=162
  [xhdpi]=216
  [xxhdpi]=324
  [xxxhdpi]=432
)

for density in "${!ADAPTIVE_SIZES[@]}"; do
  size=${ADAPTIVE_SIZES[$density]}
  dir="$PROJECT_ROOT/android/app/src/main/res/mipmap-${density}"
  mkdir -p "$dir"
  svg2png "$SCRIPT_DIR/ic_launcher_foreground.svg" "$dir/ic_launcher_foreground.png" "$size"
  echo "Android Adaptive Foreground ($density): ${size}x${size}"
done

echo "Done."
