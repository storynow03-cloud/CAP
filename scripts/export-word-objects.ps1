# Word 內嵌物件匯出(2026-10-15):LibreOffice 轉檔漏掉的物件(Word.Picture 繪圖物件、部分圖片)在題目文字裡變成 U+0001。
# 用 Word 本身(COM)把每個題號範圍內的 InlineShape 用 EnhMetaFileBits 取出 → GDI+ 以 2 倍畫成 PNG,
# 並記下物件前後各 40 字,讓 Node 端依「前文」對回資料庫文字裡的 U+0001(scripts/apply-word-objects.mjs)。
# 用法:powershell -File scripts/export-word-objects.ps1 -jobs data/obj-export-jobs.tsv -outdir data/obj-export
#   jobs 每行:<原檔完整路徑>\t<7 位題號,逗號分隔>(UTF-8)
param([string]$jobs, [string]$outdir)
Add-Type -AssemblyName System.Drawing
$label = [string][char]0x984C + [char]0x865F + [char]0xFF1A   # 題號:
New-Item -ItemType Directory -Force $outdir | Out-Null
$manifest = New-Object System.Collections.ArrayList
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
$di = 0
try {
  foreach ($line in Get-Content -Encoding UTF8 $jobs) {
    if (-not $line.Trim()) { continue }
    $di++
    $src, $nums = $line -split "`t"
    try { $d = $word.Documents.Open($src, $false, $true) } catch { "ERR open $src"; continue }
    foreach ($num in $nums -split ",") {
      $f = $d.Content
      if (-not $f.Find.Execute(($label + $num))) { [void]$manifest.Add(@{ doc = $src; num = $num; error = "num not found" }); continue }
      $start = $f.Start
      $g = $d.Range($f.End, $d.Content.End)
      $end = if ($g.Find.Execute($label)) { $g.Start } else { $d.Content.End }
      $k = 0
      foreach ($s in $d.Range($start, $end).InlineShapes) {
        $k++
        $p0 = $s.Range.Start
        $before = $d.Range([Math]::Max($start, $p0 - 40), $p0).Text
        $after = $d.Range([Math]::Min($end, $s.Range.End), [Math]::Min($end, $s.Range.End + 40)).Text
        $prog = try { $s.OLEFormat.ProgID } catch { "" }
        $name = "d$di-$num-$k.png"
        try {
          $bits = $s.Range.EnhMetaFileBits
          $ms = New-Object System.IO.MemoryStream(,[byte[]]$bits)
          $mf = New-Object System.Drawing.Imaging.Metafile($ms)
          $w = [int][Math]::Max(1, $s.Width * 96 / 72 * 2); $h = [int][Math]::Max(1, $s.Height * 96 / 72 * 2)
          $bmp = New-Object System.Drawing.Bitmap($w, $h)
          $gr = [System.Drawing.Graphics]::FromImage($bmp)
          $gr.Clear([System.Drawing.Color]::White)
          $gr.SmoothingMode = 'AntiAlias'; $gr.TextRenderingHint = 'AntiAliasGridFit'; $gr.InterpolationMode = 'HighQualityBicubic'
          $gr.DrawImage($mf, 0, 0, $w, $h)
          $bmp.Save((Join-Path $outdir $name), [System.Drawing.Imaging.ImageFormat]::Png)
          $gr.Dispose(); $bmp.Dispose(); $mf.Dispose(); $ms.Dispose()
          [void]$manifest.Add(@{ doc = $src; num = $num; k = $k; type = $s.Type; prog = $prog; file = $name; w = $w; h = $h; before = $before; after = $after })
        } catch {
          [void]$manifest.Add(@{ doc = $src; num = $num; k = $k; type = $s.Type; prog = $prog; error = "$_"; before = $before; after = $after })
        }
      }
    }
    $d.Close(0)
    "$di $src"
  }
} finally { $word.Quit() }
$manifest | ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 (Join-Path $outdir "manifest.json")
"done docs=$di objects=$($manifest.Count)"
