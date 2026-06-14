# 批次抽取 .doc 文字 → data/extracted/<科目>/.../*.txt
# 用法: powershell -File extract-docs.ps1 [科目名稱(可省略=全部)]
param([string]$Subject = "")

$root = "D:\Claude\國中會考"
$outRoot = Join-Path $root "data\extracted"
$logFile = Join-Path $root "data\extract-log.txt"
$subjects = if ($Subject) { @($Subject) } else { @('國文','英文','數學','自然','社會') }

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

$word = $null
$processedSinceRestart = 0

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

Write-Log "=== 開始抽取: $($subjects -join ',') ==="
$total = 0; $ok = 0; $fail = 0

foreach ($subj in $subjects) {
    $srcDir = Join-Path $root $subj
    if (-not (Test-Path $srcDir)) { Write-Log "略過(不存在): $subj"; continue }
    $files = Get-ChildItem -Recurse -File -Filter *.doc $srcDir
    Write-Log "[$subj] 共 $($files.Count) 檔"
    foreach ($f in $files) {
        $total++
        $rel = $f.FullName.Substring($srcDir.Length + 1)
        $outPath = Join-Path (Join-Path $outRoot $subj) ($rel -replace '\.doc$', '.txt')
        if (Test-Path $outPath) { $ok++; continue }  # 可中斷續跑
        $outDir = Split-Path $outPath -Parent
        if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
        try {
            $w = Get-Word
            $doc = $w.Documents.Open($f.FullName, $false, $true)
            $text = $doc.Content.Text
            # 統計內嵌物件(圖片/方程式),寫進檔頭供解析器標記
            $inlineCount = $doc.InlineShapes.Count
            $doc.Close($false)
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
            $header = "###META inline_shapes=$inlineCount source=$rel"
            [System.IO.File]::WriteAllText($outPath, "$header`r`n$text", [System.Text.Encoding]::UTF8)
            $ok++
            $script:processedSinceRestart++
            if ($script:processedSinceRestart -ge 80) { Restart-Word; $script:processedSinceRestart = 0 }
        } catch {
            $fail++
            Write-Log "失敗: $($f.FullName) — $($_.Exception.Message)"
            Restart-Word
        }
        if ($total % 50 -eq 0) { Write-Log "進度: $total 檔 (成功 $ok / 失敗 $fail)" }
    }
    Write-Log "[$subj] 完成"
}

Restart-Word
Write-Log "=== 全部完成: 總計 $total / 成功 $ok / 失敗 $fail ==="
