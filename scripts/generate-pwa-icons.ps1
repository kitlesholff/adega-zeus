# Gera os icones a partir da arte fornecida, preservando suas proporcoes.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$pwaOutput = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\front-end\assets\pwa'))
$pwaSource = [Drawing.Image]::FromFile((Join-Path $pwaOutput 'zeus.png'))
try {
  foreach ($pwaExport in @(
    @{ Name='icon-192.png'; Size=192; Padding=0 },
    @{ Name='icon-512.png'; Size=512; Padding=0 },
    @{ Name='apple-touch-icon.png'; Size=180; Padding=0 },
    @{ Name='icon-maskable-512.png'; Size=512; Padding=0.22 },
    @{ Name='favicon-32.png'; Size=32; Padding=0 }
  )) {
    $pwaSize = [int]$pwaExport.Size
    $pwaBitmap = New-Object Drawing.Bitmap($pwaSize, $pwaSize)
    $pwaGraphics = [Drawing.Graphics]::FromImage($pwaBitmap)
    try {
      $pwaGraphics.Clear([Drawing.Color]::FromArgb(3,6,13))
      $pwaGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $pwaGraphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $pwaSide = $pwaSize * (1 - 2 * $pwaExport.Padding)
      $pwaRatio = [Math]::Min($pwaSide / $pwaSource.Width, $pwaSide / $pwaSource.Height)
      $pwaWidth = [int][Math]::Round($pwaSource.Width * $pwaRatio)
      $pwaHeight = [int][Math]::Round($pwaSource.Height * $pwaRatio)
      $pwaGraphics.DrawImage($pwaSource, [int](($pwaSize-$pwaWidth)/2), [int](($pwaSize-$pwaHeight)/2), $pwaWidth, $pwaHeight)
      $pwaBitmap.Save((Join-Path $pwaOutput $pwaExport.Name), [Drawing.Imaging.ImageFormat]::Png)
      Write-Output "$($pwaExport.Name): ${pwaSize}x${pwaSize}"
    } finally { $pwaGraphics.Dispose(); $pwaBitmap.Dispose() }
  }
} finally { $pwaSource.Dispose() }
