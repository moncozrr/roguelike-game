# Builds the in-game Dal 8-direction sheet from the ChatGPT review sheet (8x enlarged 48x48 grid).
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File tools/make-dal-sheet.ps1
#
# Steps per cell: (1) sample the center of each 8x8 block back to 1 logical pixel,
# (2) force alpha to 0 or 255, (3) shift the cell so every direction has the same feet baseline
# and the same feet-center column. Pixels are never resampled or recolored, only moved as a whole.
# Output: public/assets/characters/dal/dal_8dir_48.png (4 columns x 2 rows of 48x48 cells = 192x96).

# Pass -SourceName to build from another review sheet in art-assets\character-design-review-2026-10-28
# (e.g. the earlier 22-dal-8-direction-48x48-grid-review.png) to roll back.
param([string]$SourceName = '23-dal-8dir-readable-32color-review.png')

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "art-assets\character-design-review-2026-10-28\$SourceName"
$outDir = Join-Path $root 'public\assets\characters\dal'
$out = Join-Path $outDir 'dal_8dir_48.png'

$scale = 8
$cell = 48
$cols = 4
$rows = 2
$baselineRow = 46      # last opaque row of every cell after alignment
$feetCenter = 24.0     # feet center line (between pixel columns 23 and 24) after alignment

$bmp = [System.Drawing.Bitmap]::FromFile($src)
if ($bmp.Width -ne ($cols * $cell * $scale) -or $bmp.Height -ne ($rows * $cell * $scale)) {
  $bmp.Dispose()
  throw "Unexpected source size $($bmp.Width)x$($bmp.Height)"
}

New-Item -ItemType Directory -Force $outDir | Out-Null
$result = New-Object System.Drawing.Bitmap ($cols * $cell), ($rows * $cell), ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($r = 0; $r -lt $rows; $r++) {
  for ($c = 0; $c -lt $cols; $c++) {
    $px = New-Object 'object[,]' $cell, $cell
    $maxY = -1
    for ($y = 0; $y -lt $cell; $y++) {
      for ($x = 0; $x -lt $cell; $x++) {
        $p = $bmp.GetPixel(($c * $cell + $x) * $scale + 4, ($r * $cell + $y) * $scale + 4)
        if ($p.A -ge 128) {
          $px[$x, $y] = [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B)
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }
    # feet center: mean x of the opaque pixels in the lowest 6 rows (both boots usually fall inside this window)
    $sumX = 0; $n = 0; $lo = 99; $hi = -1; $bboxMin = 99; $bboxMax = -1
    for ($y = 0; $y -lt $cell; $y++) {
      for ($x = 0; $x -lt $cell; $x++) {
        if ($null -eq $px[$x, $y]) { continue }
        if ($x -lt $bboxMin) { $bboxMin = $x }; if ($x -gt $bboxMax) { $bboxMax = $x }
        if ($y -ge $maxY - 5) { $sumX += $x + 0.5; $n++; if ($x -lt $lo) { $lo = $x }; if ($x -gt $hi) { $hi = $x } }
      }
    }
    $cx = $sumX / $n
    $dx = [int][Math]::Round($feetCenter - $cx)
    # never push any pixel out of the cell: limit the shift to the free space on each side
    $dx = [Math]::Max(-$bboxMin, [Math]::Min(($cell - 1 - $bboxMax), $dx))
    $dy = $baselineRow - $maxY
    $clipped = 0; $minX = 99; $maxXo = -1; $minYo = 99
    for ($y = 0; $y -lt $cell; $y++) {
      for ($x = 0; $x -lt $cell; $x++) {
        $color = $px[$x, $y]
        if ($null -eq $color) { continue }
        $nx = $x + $dx; $ny = $y + $dy
        if ($nx -lt 0 -or $nx -ge $cell -or $ny -lt 0 -or $ny -ge $cell) { $clipped++; continue }
        $result.SetPixel(($c * $cell + $nx), ($r * $cell + $ny), $color)
        if ($nx -lt $minX) { $minX = $nx }; if ($nx -gt $maxXo) { $maxXo = $nx }; if ($ny -lt $minYo) { $minYo = $ny }
      }
    }
    "cell r$r c$c : bottomRow=$maxY (x $lo..$hi) shift dx=$dx dy=$dy clipped=$clipped bbox x[$minX..$maxXo] top=$minYo"
  }
}

$result.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

# Review preview (not used by the game): 6x enlarged on gray with the feet center line and baseline drawn.
$prev = New-Object System.Drawing.Bitmap ($cols * $cell * 6), ($rows * $cell * 6)
$g = [System.Drawing.Graphics]::FromImage($prev)
$g.Clear([System.Drawing.Color]::FromArgb(255, 90, 110, 110))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.DrawImage($result, 0, 0, ($cols * $cell * 6), ($rows * $cell * 6))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(160, 255, 255, 0)), 1
for ($r = 0; $r -lt $rows; $r++) {
  for ($c = 0; $c -lt $cols; $c++) {
    $g.DrawLine($pen, ($c * $cell + 24) * 6, $r * $cell * 6, ($c * $cell + 24) * 6, ($r + 1) * $cell * 6)
    $g.DrawLine($pen, $c * $cell * 6, ($r * $cell + $baselineRow + 1) * 6, ($c + 1) * $cell * 6, ($r * $cell + $baselineRow + 1) * 6)
  }
}
$prevPath = Join-Path $env:TEMP 'dal-sheet-preview.png'
$prev.Save($prevPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $prev.Dispose()
"preview $prevPath"
$result.Dispose()
$bmp.Dispose()
"saved $out"
