# 限時分批 HTML 轉換(在呼叫端行程內執行,須前景)
param([int]$BudgetSec = 195)

$root = "D:\Claude\國中會考"
$deadline = (Get-Date).AddSeconds($BudgetSec)
$pending = @()
foreach ($subj in @('數學','自然')) {
    $srcDir = Join-Path $root $subj
    foreach ($f in (Get-ChildItem -Recurse -File -Filter *.doc $srcDir)) {
        $rel = $f.FullName.Substring($srcDir.Length + 1)
        $out = Join-Path (Join-Path "$root\data\html" $subj) ($rel -replace '\.doc$', '.htm')
        if (-not (Test-Path $out)) { $pending += [pscustomobject]@{ Src = $f.FullName; Out = $out } }
    }
}
Write-Output "待轉換: $($pending.Count) 檔"
if ($pending.Count -eq 0) { Write-Output "ALL_DONE"; exit 0 }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$done = 0; $fail = 0
try {
    foreach ($p in $pending) {
        if ((Get-Date) -gt $deadline) { break }
        $dir = Split-Path $p.Out
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        try {
            $doc = $word.Documents.Open($p.Src, $false, $true)
            $doc.WebOptions.Encoding = 65001
            $doc.SaveAs2($p.Out, 10)
            $doc.Close($false)
            $done++
        } catch {
            $fail++
            Add-Content -Path "$root\data\html-extract-log.txt" -Value "失敗: $($p.Src) — $($_.Exception.Message)" -Encoding UTF8
            try { $doc.Close($false) } catch {}
        }
    }
} finally {
    try { $word.Quit() } catch {}
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch {}
}
$remain = $pending.Count - $done - $fail
Write-Output "本批完成 $done / 失敗 $fail / 剩餘 $remain"
if ($remain -le 0) { Write-Output "ALL_DONE" }
