param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][int]$Size
)

Add-Type -AssemblyName System.Drawing

$sourceImage = [System.Drawing.Image]::FromFile($Source)
$targetImage = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($targetImage)

$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$graphics.DrawImage($sourceImage, 0, 0, $Size, $Size)

$targetDir = Split-Path -Parent $Target
if ($targetDir) {
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$targetImage.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$targetImage.Dispose()
$sourceImage.Dispose()
