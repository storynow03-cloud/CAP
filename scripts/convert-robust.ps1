# 穩健 HTML 轉換器:看門狗 + 工作程序,自動跳過卡死的檔案
# 使用者只要執行(無參數)即可:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Claude\國中會考\scripts\convert-robust.ps1"
param([switch]$Worker)

$root = "D:\Claude\國中會考"
$hb = "$root\data\convert-heartbeat.txt"
$skiplist = "$root\data\convert-skiplist.txt"
$subjects = @('數學', '自然')

function Get-Pending {
    $list = @()
    foreach ($s in $subjects) {
        $sd = Join-Path $root $s
        if (-not (Test-Path $sd)) { continue }
        foreach ($f in (Get-ChildItem -Recurse -File -Filter *.doc $sd | Sort-Object FullName)) {
            $rel = $f.FullName.Substring($sd.Length + 1)
            $o = Join-Path "$root\data\html\$s" ($rel -replace '\.doc$', '.htm')
            $list += [pscustomobject]@{ Src = $f.FullName; Out = $o; Subject = $s }
        }
    }
    return $list
}

# ===== 工作程序模式:重用一個 Word,逐檔轉換,寫心跳 =====
if ($Worker) {
    $skip = @{}
    if (Test-Path $skiplist) { Get-Content $skiplist -Encoding UTF8 | ForEach-Object { $skip[$_] = $true } }
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $count = 0
    foreach ($item in Get-Pending) {
        if (Test-Path $item.Out) { continue }
        if ($skip.ContainsKey($item.Src)) { continue }
        # 心跳:時間戳 | 正在處理的檔
        [IO.File]::WriteAllText($hb, "$([DateTimeOffset]::Now.ToUnixTimeSeconds())|$($item.Src)", [Text.Encoding]::UTF8)
        $d = Split-Path $item.Out
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }
        try {
            $doc = $word.Documents.Open($item.Src, $false, $true)
            $doc.WebOptions.Encoding = 65001
            $doc.SaveAs2($item.Out, 10)
            $doc.Close($false)
        } catch { try { $doc.Close($false) } catch {} }
        $count++
        if ($count % 50 -eq 0) {
            try { $word.Quit() } catch {}
            [GC]::Collect()
            $word = New-Object -ComObject Word.Application
            $word.Visible = $false
            $word.DisplayAlerts = 0
        }
    }
    try { $word.Quit() } catch {}
    [IO.File]::WriteAllText($hb, "DONE", [Text.Encoding]::UTF8)
    exit 0
}

# ===== 看門狗模式(預設):啟動工作程序,監控心跳,卡住就跳過 =====
$total = (Get-Pending).Count
$alreadyDone = (Get-Pending | Where-Object { Test-Path $_.Out }).Count
Write-Host "===== 穩健轉換器啟動 =====" -ForegroundColor Cyan
Write-Host "總檔案 $total,已完成 $alreadyDone,待轉 $($total - $alreadyDone)" -ForegroundColor Cyan
Write-Host "卡住超過 75 秒的檔會自動跳過。可隨時關閉視窗,重跑會接續。`n" -ForegroundColor Yellow

$STALL_LIMIT = 75
while ($true) {
    $remaining = (Get-Pending | Where-Object { -not (Test-Path $_.Out) }).Count
    if ($remaining -eq 0) { break }

    taskkill /IM winword.exe /F 2>$null | Out-Null
    if (Test-Path $hb) { Remove-Item $hb -Force }

    $proc = Start-Process powershell -PassThru -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Worker'
    )

    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 12
        $doneNow = (Get-Pending | Where-Object { Test-Path $_.Out }).Count
        $pct = [math]::Round($doneNow / $total * 100)
        Write-Host ("  進度 {0}/{1} ({2}%)" -f $doneNow, $total, $pct)
        if (-not (Test-Path $hb)) { continue }
        $h = [IO.File]::ReadAllText($hb)
        if ($h -eq "DONE") { break }
        $parts = $h -split '\|', 2
        if ($parts.Count -lt 2) { continue }
        $age = [DateTimeOffset]::Now.ToUnixTimeSeconds() - [long]$parts[0]
        if ($age -gt $STALL_LIMIT) {
            Write-Host ("  ⚠️ 跳過卡住的檔: {0}" -f (Split-Path $parts[1] -Leaf)) -ForegroundColor Red
            Add-Content $skiplist $parts[1] -Encoding UTF8
            try { $proc.Kill() } catch {}
            taskkill /IM winword.exe /F 2>$null | Out-Null
            break
        }
    }
    try { if (-not $proc.HasExited) { $proc.Kill() } } catch {}
}

taskkill /IM winword.exe /F 2>$null | Out-Null
$skipped = if (Test-Path $skiplist) { (Get-Content $skiplist | Measure-Object).Count } else { 0 }
Write-Host "`n===== 全部完成! =====" -ForegroundColor Green
Write-Host "成功轉換,跳過 $skipped 個卡住的檔(這些會用文字版題目)" -ForegroundColor Green
Write-Host "請回到 Claude 對話,我會接手匯入。" -ForegroundColor Green
