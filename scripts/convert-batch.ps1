# 前景小批轉換:轉指定資料夾的前 N 個未轉檔,馬上回傳
param([string]$Dir, [int]$Max = 5)
$root = "D:\Claude\國中會考"
$subj = $Dir.Substring(0, $Dir.IndexOf('\'))
$sd = "$root\$Dir"
$skipFile = "$root\data\html-skiplist.txt"
$skip = @{}
if (Test-Path $skipFile) { Get-Content $skipFile -Encoding UTF8 | ForEach-Object { $skip[$_] = $true } }
$pending = @()
foreach ($f in (Get-ChildItem -Recurse -File -Filter *.doc $sd)) {
  $rel = $f.FullName.Substring("$root\$subj".Length + 1)
  $o = Join-Path "$root\data\html\$subj" ($rel -replace '\.doc$', '.htm')
  if ((Test-Path $o) -or $skip.ContainsKey($f.FullName)) { continue }
  $pending += [pscustomobject]@{ Src = $f.FullName; Out = $o }
}
$batch = $pending | Select-Object -First $Max
Write-Output "待轉 $($pending.Count),本批做 $($batch.Count)"
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
$done = 0
foreach ($p in $batch) {
  [IO.File]::WriteAllText("$root\data\html-current.txt", $p.Src, [Text.Encoding]::UTF8)
  $dir = Split-Path $p.Out
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  try {
    $doc = $word.Documents.Open($p.Src, $false, $true)
    $doc.WebOptions.Encoding = 65001
    $doc.SaveAs2($p.Out, 10)
    $doc.Close($false)
    $done++
    Write-Output "  OK $(Split-Path $p.Src -Leaf)"
  } catch { try { $doc.Close($false) } catch {}; Write-Output "  FAIL $(Split-Path $p.Src -Leaf)" }
}
try { $word.Quit() } catch {}
Write-Output "完成 $done / 剩 $($pending.Count - $done)"