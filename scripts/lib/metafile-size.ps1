# 用 GDI+ 讀 WMF/EMF 的顯示大小(與 LibreOffice 輸出的長寬比一致;PIL 讀 EMF 的邊界不準)
# 用法:metafile-size.ps1 -List <每行一個路徑>  → 輸出「行號\t寬\t高」(行號從 0 起,不輸出路徑以免中文亂碼;單位:96dpi 像素)
param([string]$List)
Add-Type -AssemblyName System.Drawing
$i = 0
foreach ($p in Get-Content -Encoding UTF8 $List) {
  try {
    $mf = New-Object System.Drawing.Imaging.Metafile($p)
    $w = $mf.Width * 96 / $mf.HorizontalResolution; $h = $mf.Height * 96 / $mf.VerticalResolution
    "$i`t$w`t$h"; $mf.Dispose()
  } catch { "$i`t0`t0" }
  $i++
}
