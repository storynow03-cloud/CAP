# LibreOffice 批次轉換 .doc → HTML(含圖片),背景安全、不卡死
# 逐「來源子資料夾」批次轉(同資料夾內檔名唯一,可保留結構)
# 會考真題資料夾排最前面優先轉
$root = "D:\Claude\國中會考"
$soffice = "C:\Program Files\LibreOffice\program\soffice.exe"
$outRoot = "$root\data\lo-html"
$log = "$root\data\lo-convert-log.txt"

function Log($m) { Add-Content $log "$(Get-Date -Format 'HH:mm:ss') $m" -Encoding UTF8 }

# 優先順序:會考真題在前
$priority = @(
  "數學\09.國中教育會考(依年度)", "自然\國中教育會考",
  "數學\10.國中教育會考(依章節)", "數學\11.仿會考非選擇題"
)

# 收集所有含 .doc 的子資料夾
$allDirs = @()
foreach ($subj in @('數學','自然')) {
  Get-ChildItem -Recurse -Directory "$root\$subj" | ForEach-Object {
    if (Get-ChildItem $_.FullName -Filter *.doc -File) { $allDirs += $_.FullName }
  }
}
# 排序:優先資料夾在前
$ordered = @()
foreach ($p in $priority) { $ordered += $allDirs | Where-Object { $_ -like "*$p*" } }
$ordered += $allDirs | Where-Object { $ordered -notcontains $_ }

Log "=== LibreOffice 轉換開始,共 $($ordered.Count) 個資料夾 ==="
$totalDone = 0
foreach ($dir in $ordered) {
  $subj = if ($dir -like "*\數學\*" -or $dir -like "*\數學") { "數學" } else { "自然" }
  $rel = $dir.Substring("$root\$subj".Length).TrimStart('\')
  $outDir = Join-Path "$outRoot\$subj" $rel
  New-Item -ItemType Directory -Force $outDir | Out-Null

  $docs = Get-ChildItem $dir -Filter *.doc -File
  $todo = $docs | Where-Object { -not (Test-Path (Join-Path $outDir ($_.BaseName + ".html"))) }
  if ($todo.Count -eq 0) { continue }

  Log "資料夾 [$rel]: 轉 $($todo.Count) 檔"
  # 一次丟整個資料夾(批次省啟動成本)
  $srcs = $todo | ForEach-Object { $_.FullName }
  & $soffice --headless --convert-to html --outdir $outDir $srcs 2>&1 | Out-Null

  # 補轉失敗的(逐檔重試一次)
  $still = $docs | Where-Object { -not (Test-Path (Join-Path $outDir ($_.BaseName + ".html"))) }
  foreach ($f in $still) {
    & $soffice --headless --convert-to html --outdir $outDir $f.FullName 2>&1 | Out-Null
  }
  $made = ($docs | Where-Object { Test-Path (Join-Path $outDir ($_.BaseName + ".html")) }).Count
  $totalDone += $made
  Log "  完成,本資料夾已轉 $made/$($docs.Count),累計 $totalDone"
}
Log "=== 全部完成,共 $totalDone 檔 ==="
[IO.File]::WriteAllText("$root\data\lo-done.flag", "DONE", [Text.Encoding]::UTF8)
