# 用 Word 直接讀出 .doc 裡每個 EQ 功能變數的代碼,並標出上標字元(不另存檔;SaveAs2 在本機會卡住)
# 輸出 data/eq-sup-word/<科目>/<相對路徑>.jsonl,每行 {"q":題號,"plain":代碼,"marked":上標前後加 U+E000/U+E001}
# 題號:往前找最近的「題號：NNNNNNN」。原始 .doc 唯讀開啟、絕不覆寫;已輸出的略過,可中斷續跑。
# 用法:powershell -File scripts/export-eq-sup-word.ps1 [-Subject 自然] [-Only 關鍵字]
param([string]$Subject = "自然", [string]$Only = "")

$root = "D:\Claude\國中會考"
$outRoot = Join-Path $root "data\eq-sup-word"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$count = 0
$S = [char]0xE000; $E = [char]0xE001
try {
  $srcDir = Join-Path $root $Subject
  foreach ($f in Get-ChildItem -Recurse -File -Filter *.doc $srcDir) {
    $rel = $f.FullName.Substring($srcDir.Length + 1)
    if ($Only -and ($rel -notlike "*$Only*")) { continue }
    $out = Join-Path (Join-Path $outRoot $Subject) ($rel + ".jsonl")
    if (Test-Path $out) { continue }
    New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
    $lines = New-Object System.Collections.Generic.List[string]
    try {
      $d = $word.Documents.Open($f.FullName, $false, $true, $false)
      $full = $d.Content.Text
      foreach ($fld in $d.Fields) {
        $code = $fld.Code
        $txt = $code.Text
        if ($txt -notmatch '^\s*EQ') { continue }
        if ($code.Font.Superscript -eq 0) { continue }  # 整段都沒有上標(混合時是 9999999)就不逐字檢查
        $marked = ""; $has = $false
        foreach ($ch in $code.Characters) {
          $c = $ch.Text
          if ($ch.Font.Superscript -eq -1 -and $c.Trim()) { $marked += $S + $c + $E; $has = $true } else { $marked += $c }
        }
        if (-not $has) { continue }
        $pre = $full.Substring(0, [Math]::Min($fld.Result.Start, $full.Length))
        $m = [regex]::Matches($pre, '題號：\s*(\d{7})')
        $q = if ($m.Count) { $m[$m.Count - 1].Groups[1].Value } else { "" }
        $lines.Add((@{ q = $q; plain = $txt; marked = $marked } | ConvertTo-Json -Compress))
      }
      $d.Close(0)
      [IO.File]::WriteAllLines($out, $lines, (New-Object Text.UTF8Encoding $false))
    } catch {
      Write-Output "FAIL $rel $($_.Exception.Message)"
      try { $d.Close(0) } catch {}
    }
    $count++
    if ($count % 10 -eq 0) { Write-Output "$(Get-Date -Format HH:mm:ss) $Subject $count done" }
  }
} finally { $word.Quit() }
Write-Output "ALL DONE $count"
