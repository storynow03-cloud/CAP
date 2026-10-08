# Word COM 把自然科二進位 .doc 另存成 docx(2026-10-07,公式稽核用)→ data/word-docx/自然/<相對路徑>.docx(只留本機)
# 原檔唯讀開啟、絕不覆寫;已轉過的略過,可中斷續跑。用法:powershell -File scripts/word-to-docx.ps1 [-Only <關鍵字>] [-Max <數量>]
param([string]$Only = "", [int]$Max = 0)
$root = "D:\Claude\國中會考"
$srcDir = Join-Path $root "自然"
$outRoot = Join-Path $root "data\word-docx\自然"
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
$word.Options.SaveNormalPrompt = $false
$n = 0; $fail = 0
try {
  foreach ($f in Get-ChildItem -Recurse -File -Filter *.doc $srcDir) {
    $rel = $f.FullName.Substring($srcDir.Length + 1)
    if ($Only -and ($rel -notlike "*$Only*")) { continue }
    $dst = Join-Path $outRoot ([IO.Path]::ChangeExtension($rel, ".docx"))
    if (Test-Path $dst) { continue }
    New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
    try {
      $d = $word.Documents.Open($f.FullName, $false, $true, $false)
      $d.SaveAs2([string]$dst, 16)
      $d.Close(0); $n++
    } catch { $fail++; "ERR $rel : $($_.Exception.Message)"; try { $d.Close(0) } catch {} }
    if ($n % 25 -eq 0) { "$(Get-Date -Format HH:mm:ss) $n done" }
    if ($Max -and ($n + $fail) -ge $Max) { break }
  }
} finally { $word.Quit() }
"ALL DONE $n fail $fail"
