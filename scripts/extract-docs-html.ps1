# 批次將 .doc 另存為 FilteredHTML(UTF-8)→ data/html/<科目>/...
# 數學式與圖片會匯出成圖片檔,上標保留 <sup>
param([string]$Subject = "", [int]$MaxFiles = 0)

$root = "D:\Claude\國中會考"
$outRoot = Join-Path $root "data\html"
$logFile = Join-Path $root "data\html-extract-log.txt"
$subjects = if ($Subject) { @($Subject) } else { @('數學','自然') }

function Write-Log($msg) {
    Add-Content -Path $logFile -Value "$(Get-Date -Format 'HH:mm:ss') $msg" -Encoding UTF8
}

$word = $null
$count = 0

function Get-Word {
    if ($null -eq $script:word) {
        $script:word = New-Object -ComObject Word.Application
        $script:word.Visible = $false
        $script:word.DisplayAlerts = 0
    }
    return $script:word
}

function Restart-Word {
    if ($null -ne $script:word) {
        try { $script:word.Quit() } catch {}
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:word) | Out-Null } catch {}
        $script:word = $null
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    }
}

Write-Log "=== HTML 抽取開始: $($subjects -join ',') (MaxFiles=$MaxFiles) ==="
$total = 0; $ok = 0; $fail = 0; $processed = 0

foreach ($subj in $subjects) {
    $srcDir = Join-Path $root $subj
    if (-not (Test-Path $srcDir)) { Write-Log "略過: $subj"; continue }
    $files = Get-ChildItem -Recurse -File -Filter *.doc $srcDir
    Write-Log "[$subj] 共 $($files.Count) 檔"
    foreach ($f in $files) {
        $total++
        $rel = $f.FullName.Substring($srcDir.Length + 1)
        $outPath = Join-Path (Join-Path $outRoot $subj) ($rel -replace '\.doc$', '.htm')
        if (Test-Path $outPath) { $ok++; continue }
        $outDir = Split-Path $outPath -Parent
        if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
        if ($MaxFiles -gt 0 -and $processed -ge $MaxFiles) {
            Restart-Word
            Write-Log "已達本批上限 $MaxFiles,結束(成功 $ok / 失敗 $fail)"
            Write-Output "BATCH_DONE processed=$processed ok=$ok fail=$fail"
            exit 0
        }
        try {
            $w = Get-Word
            $doc = $w.Documents.Open($f.FullName, $false, $true)
            $doc.WebOptions.Encoding = 65001
            # 10 = wdFormatFilteredHTML
            $doc.SaveAs2($outPath, 10)
            $doc.Close($false)
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
            $ok++
            $processed++
            $script:count++
            if ($script:count -ge 60) { Restart-Word; $script:count = 0 }
        } catch {
            $fail++
            Write-Log "失敗: $($f.FullName) — $($_.Exception.Message)"
            Restart-Word
        }
        if ($total % 50 -eq 0) { Write-Log "進度: $total (成功 $ok / 失敗 $fail)" }
    }
    Write-Log "[$subj] 完成"
}

Restart-Word
Write-Log "=== 完成: $total / 成功 $ok / 失敗 $fail ==="
