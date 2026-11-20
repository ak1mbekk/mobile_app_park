# Export the approved opening portrait at the mobile platforms' existing sizes.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$art = [Drawing.Image]::FromFile((Join-Path $root 'Godot/Art/Brand/park-opening.png'))
$portrait = [Drawing.Rectangle]::new(176, 500, 520, 520)
# Android masks and moves the adaptive layer. Include more scenery around the ears.
$adaptive = [Drawing.Rectangle]::new(20, 385, 790, 790)

function Export-Icon($path, [int]$size, [Drawing.Rectangle]$crop, [string]$shape) {
    $square = $shape -eq 'square'
    $format = if ($square) { 'Format24bppRgb' } else { 'Format32bppArgb' }
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]$format)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.InterpolationMode = 'HighQualityBicubic'
        $graphics.PixelOffsetMode = 'HighQuality'
        $graphics.SmoothingMode = 'AntiAlias'
        if ($square) {
            $bounds = [Drawing.Rectangle]::new(0, 0, $size, $size)
            $graphics.DrawImage($art, $bounds, $crop, [Drawing.GraphicsUnit]::Pixel)
        } else {
            $margin = [Math]::Max(1, [Math]::Round($size * 0.04))
            $edge = [int]($size - 2 * $margin)
            $bounds = [Drawing.Rectangle]::new($margin, $margin, $edge, $edge)
            $photo = [Drawing.Bitmap]::new($edge, $edge)
            $painter = [Drawing.Graphics]::FromImage($photo)
            $mask = [Drawing.Drawing2D.GraphicsPath]::new()
            $brush = $null
            try {
                $painter.InterpolationMode = 'HighQualityBicubic'
                $painter.DrawImage($art, [Drawing.Rectangle]::new(0, 0, $edge, $edge), $crop, [Drawing.GraphicsUnit]::Pixel)
                $brush = [Drawing.TextureBrush]::new($photo)
                $brush.TranslateTransform($margin, $margin)
                if ($shape -eq 'round') {
                    $mask.AddEllipse($bounds)
                } else {
                    $arc = [int]($edge * 0.42)
                    $mask.AddArc($bounds.Left, $bounds.Top, $arc, $arc, 180, 90)
                    $mask.AddArc($bounds.Right - $arc, $bounds.Top, $arc, $arc, 270, 90)
                    $mask.AddArc($bounds.Right - $arc, $bounds.Bottom - $arc, $arc, $arc, 0, 90)
                    $mask.AddArc($bounds.Left, $bounds.Bottom - $arc, $arc, $arc, 90, 90)
                    $mask.CloseFigure()
                }
                $graphics.FillPath($brush, $mask)
            } finally {
                if ($brush) { $brush.Dispose() }
                $mask.Dispose()
                $painter.Dispose()
                $photo.Dispose()
            }
        }
        $bitmap.Save((Join-Path $root $path), [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

try {
    Export-Icon 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png' 1024 $portrait square
    Export-Icon 'public/demo/assets/park-touch-icon.png' 180 $portrait square
    Export-Icon 'public/demo/assets/park-favicon.png' 32 $portrait squircle
    foreach ($density in @{mdpi=1; hdpi=1.5; xhdpi=2; xxhdpi=3; xxxhdpi=4}.GetEnumerator()) {
        $folder = 'android/app/src/main/res/mipmap-' + $density.Key
        Export-Icon "$folder/ic_launcher.png" (48 * $density.Value) $portrait squircle
        Export-Icon "$folder/ic_launcher_round.png" (48 * $density.Value) $portrait round
        Export-Icon "$folder/ic_launcher_foreground.png" (108 * $density.Value) $adaptive square
    }
} finally {
    $art.Dispose()
}
