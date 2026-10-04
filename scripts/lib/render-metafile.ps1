# 用 GDI+ 把 WMF/EMF 畫成指定像素大小的 PNG(白底、反鋸齒)
# 用法:render.ps1 -Jobs <tsv 檔:來源向量圖\t輸出png\t寬\t高>
param([string]$Jobs)
Add-Type -AssemblyName System.Drawing
foreach ($line in Get-Content -Encoding UTF8 $Jobs) {
  $src, $dst, $w, $h = $line -split "`t"
  try {
    $mf = New-Object System.Drawing.Imaging.Metafile($src)
    $bmp = New-Object System.Drawing.Bitmap([int]$w, [int]$h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'
    $g.TextRenderingHint = 'AntiAliasGridFit'; $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($mf, 0, 0, [int]$w, [int]$h)
    $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $mf.Dispose()
    "ok`t$dst"
  } catch { "fail`t$src`t$($_.Exception.Message)" }
}
