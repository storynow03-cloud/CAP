# Word COM 把 .doc 轉 PDF(會正確畫出方程式;LibreOffice 會漏)。用法:powershell -File scripts/word-to-pdf.ps1 -list <src<TAB>dst 每行一筆的 UTF-8 檔> -outdir <資料夾>
param([string]$list, [string]$outdir)
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
$n = 0; $fail = 0
foreach ($line in Get-Content -Encoding UTF8 $list) {
  $src, $dst = $line -split "`t"
  if (Test-Path $dst) { continue }
  try { $doc = $word.Documents.Open($src, $false, $true); $doc.ExportAsFixedFormat($dst, 17); $doc.Close(0); $n++ }
  catch { $fail++; "ERR $src : $_" }
}
$word.Quit()
"done $n fail $fail"
