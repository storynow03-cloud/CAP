# 匯出數學/自然 .doc 的全文「含功能變數代碼」→ data/eq-text/<科目>/<相對路徑>.txt(UTF-8)
# Word EQ 變數(分數 \F、根號 \R、上劃線 \O …)在 LibreOffice/HTML 匯出時整個消失,
# 造成「吃了全部的,」這類靜默缺字。這裡用 TextRetrievalMode.IncludeFieldCodes 一次讀出全文,
# 變數以 chr(19) 代碼 chr(21) 包住(有結果時 chr(20) 分隔),再由 restore-eq-fields.mjs 對齊補回。
# 原始 .doc 唯讀開啟,絕不覆寫。已匯出的檔案會略過,可中斷續跑。
param([string]$Subject = "", [string]$Only = "")

$root = "D:\Claude\國中會考"
$outRoot = Join-Path $root "data\eq-text"
$subjects = if ($Subject) { @($Subject) } else { @('數學','自然') }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$count = 0
try {
  foreach ($subj in $subjects) {
    $srcDir = Join-Path $root $subj
    foreach ($f in Get-ChildItem -Recurse -File -Filter *.doc $srcDir) {
      $rel = $f.FullName.Substring($srcDir.Length + 1)
      if ($Only -and ($rel -notlike "*$Only*")) { continue }
      $out = Join-Path (Join-Path $outRoot $subj) ($rel + ".txt")
      if (Test-Path $out) { continue }
      New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
      try {
        $d = $word.Documents.Open($f.FullName, $false, $true, $false)
        $r = $d.Content
        $r.TextRetrievalMode.IncludeFieldCodes = $true
        $t = $r.Text
        $d.Close(0)
        [IO.File]::WriteAllText($out, $t, (New-Object Text.UTF8Encoding $false))
      } catch {
        Write-Output "FAIL $rel $($_.Exception.Message)"
        try { $d.Close(0) } catch {}
      }
      $count++
      if ($count % 25 -eq 0) { Write-Output "$(Get-Date -Format HH:mm:ss) $subj $count done" }
    }
  }
} finally { $word.Quit() }
Write-Output "ALL DONE $count"
