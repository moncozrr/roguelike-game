# Builds the character-select portraits from the large review illustrations.
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File tools/make-portraits.ps1
#
# Per source image:
#   1. Pixels with alpha below 24 are cleared to transparent black (this also drops hidden colors such as a
#      leftover checkerboard, which would otherwise bleed into the edges when scaling).
#   2. Connected groups of opaque pixels smaller than 60 pixels (stray speckles) are removed.
#   3. The result is cropped to the remaining pixels (plus padding), scaled to a fixed height, and saved as PNG
#      into public/assets/characters/portraits/.

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;

public static class PortraitClean
{
    // Returns: minX, minY, maxX, maxY, clearedFaint, removedSpeckles (as an int array).
    public static int[] Run(Bitmap bmp, int alphaCut, int minArea)
    {
        int w = bmp.Width, h = bmp.Height;
        BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        byte[] px = new byte[stride * h];
        System.Runtime.InteropServices.Marshal.Copy(data.Scan0, px, 0, px.Length);

        int clearedFaint = 0;
        bool[] opaque = new bool[w * h];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int i = y * stride + x * 4;
                if (px[i + 3] >= alphaCut) { opaque[y * w + x] = true; }
                else if (px[i] != 0 || px[i + 1] != 0 || px[i + 2] != 0 || px[i + 3] != 0)
                {
                    px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0; clearedFaint++;
                }
            }

        int removed = 0;
        bool[] seen = new bool[w * h];
        int minX = w, minY = h, maxX = -1, maxY = -1;
        int[] stack = new int[w * h];
        List<int> comp = new List<int>();
        for (int start = 0; start < w * h; start++)
        {
            if (!opaque[start] || seen[start]) continue;
            comp.Clear();
            int sp = 0; stack[sp++] = start; seen[start] = true;
            while (sp > 0)
            {
                int cur = stack[--sp]; comp.Add(cur);
                int cx = cur % w, cy = cur / w;
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        int ni = ny * w + nx;
                        if (opaque[ni] && !seen[ni]) { seen[ni] = true; stack[sp++] = ni; }
                    }
            }
            if (comp.Count < minArea)
            {
                foreach (int idx in comp)
                {
                    int i = (idx / w) * stride + (idx % w) * 4;
                    px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
                }
                removed++;
            }
            else
            {
                foreach (int idx in comp)
                {
                    int x = idx % w, y = idx / w;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
        }
        System.Runtime.InteropServices.Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
        return new int[] { minX, minY, maxX, maxY, clearedFaint, removed };
    }
}
'@ -ReferencedAssemblies System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root 'art-assets\character-design-review-2026-10-28'
$outDir = Join-Path $root 'public\assets\characters\portraits'
New-Item -ItemType Directory -Force $outDir | Out-Null

$jobs = @(
  @{ Source = '30-dal-character-select-proportion-review.png'; Out = 'dal.png' },
  @{ Source = '18-protagonist-heroine-chatgpt-transparent-2p5.png'; Out = 'mujin.png' }
)
$targetHeight = 560
$padding = 12
$alphaCut = 24
$minArea = 60

foreach ($job in $jobs) {
  $bmp = New-Object System.Drawing.Bitmap ((Join-Path $srcDir $job.Source))
  $r = [PortraitClean]::Run($bmp, $alphaCut, $minArea)
  $minX = $r[0]; $minY = $r[1]; $maxX = $r[2]; $maxY = $r[3]
  $cropX = [Math]::Max(0, $minX - $padding); $cropY = [Math]::Max(0, $minY - $padding)
  $cropW = [Math]::Min($bmp.Width, $maxX + $padding + 1) - $cropX; $cropH = [Math]::Min($bmp.Height, $maxY + $padding + 1) - $cropY
  $scale = $targetHeight / $cropH
  $outW = [int][Math]::Round($cropW * $scale)
  $out = New-Object System.Drawing.Bitmap $outW, $targetHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $outW, $targetHeight), (New-Object System.Drawing.Rectangle $cropX, $cropY, $cropW, $cropH), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $path = Join-Path $outDir $job.Out
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  "$($job.Source) -> $($job.Out): kept bbox x[$minX..$maxX] y[$minY..$maxY], removed speckle groups: $($r[5]), cleared faint pixels: $($r[4]), output ${outW}x${targetHeight}, $((Get-Item $path).Length) bytes"
  $out.Dispose(); $bmp.Dispose()
}
