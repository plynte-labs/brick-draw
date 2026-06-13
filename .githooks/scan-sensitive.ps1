# ============================================================
# brick-draw - Sensitive Data Scanner (PowerShell standalone)
# ============================================================
# Usage:
#   .githooks\scan-sensitive.ps1
#   .githooks\scan-sensitive.ps1 -Staged
#   .githooks\scan-sensitive.ps1 -Since main
# ============================================================
param(
    [switch]$Staged,
    [string]$Since = ""
)

$ErrorActionPreference = "Stop"
$violations = 0
$repoRoot = (Get-Location).Path

Write-Host "`n  brick-draw Sensitive Data Scanner" -ForegroundColor Cyan
Write-Host "  ====================================" -ForegroundColor Cyan

$winPathPattern = '(^|[^A-Za-z0-9_])[A-Za-z]:\\([^\\/:*?"<>|\s]+\\)+[^\\/:*?"<>|\s]*'
$unixPathPattern = '(^|[^A-Za-z0-9_])/(home|Users)/[^/\s]+(/[^/\s]+)*'
$secretsPattern = '(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|hf_[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9\-_]{20,})'
$subscriptionPattern = '"subscription"\s*:\s*"'
$localhostPattern = 'http://(127\.0\.0\.1|localhost):[0-9]+'
$forbiddenFiles = @(
    '^\.env$',
    '^\.env\.local$',
    '^\.env\..*\.local$',
    '^prompt\.md$'
)
$binaryPattern = '\.(png|jpg|jpeg|gif|bmp|ico|svg|ttf|woff|woff2|lock|exe|dll)$'
$textPattern = '\.(ts|tsx|rs|json|md|yaml|yml|toml|html|css|sh|ps1|conf)$'

function Normalize-RepoPath {
    param([string]$PathValue)

    $fullPath = [System.IO.Path]::GetFullPath($PathValue)
    $rootPath = [System.IO.Path]::GetFullPath($repoRoot)

    if ($fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relativePath = $fullPath.Substring($rootPath.Length).TrimStart(
            [System.IO.Path]::DirectorySeparatorChar,
            [System.IO.Path]::AltDirectorySeparatorChar
        )
        return $relativePath.Replace('\', '/')
    }

    return $PathValue.Replace('\', '/')
}

function Should-SkipPath {
    param([string]$PathValue)

    return (
        $PathValue -match '^\.env$' -or
        $PathValue -match '^\.env\.local$' -or
        $PathValue -match '^\.env\..*\.local$' -or
        $PathValue -match '(^|/)\.git/' -or
        $PathValue -match '(^|/)\.engram/' -or
        $PathValue -match '(^|/)\.atl/' -or
        $PathValue -match '(^|/)\.githooks/' -or
        $PathValue -match '(^|/)node_modules/' -or
        $PathValue -match '(^|/)dist/' -or
        $PathValue -match '(^|/)target/' -or
        $PathValue -match '(^|/)__pycache__/' -or
        $PathValue -match '^openspec/specs/'
    )
}

function Get-ScanFiles {
    $previousNativeErrorPreference = $PSNativeCommandUseErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $false

    try {
    if ($Staged) {
        Write-Host "  Mode: staged files only" -ForegroundColor Yellow
        return @(& git -c core.safecrlf=false diff --cached --name-only 2>$null | Where-Object { $_ -and -not (Should-SkipPath $_) })
    }

    if ($Since) {
        Write-Host "  Mode: changed since $Since" -ForegroundColor Yellow
        return @(& git -c core.safecrlf=false diff --name-only $Since 2>$null | Where-Object { $_ -and -not (Should-SkipPath $_) })
    }

    Write-Host "  Mode: full repo scan" -ForegroundColor Yellow
    return @(Get-ChildItem -Recurse -File | ForEach-Object {
        $normalized = Normalize-RepoPath $_.FullName
        if (-not (Should-SkipPath $normalized)) { $normalized }
    })
    }
    finally {
        $PSNativeCommandUseErrorActionPreference = $previousNativeErrorPreference
    }
}

$files = Get-ScanFiles

if ($files.Count -eq 0) {
    Write-Host "  No files to scan" -ForegroundColor Green
    exit 0
}

foreach ($file in $files) {
    $filename = Split-Path $file -Leaf

    foreach ($forbidden in $forbiddenFiles) {
        if ($filename -match $forbidden) {
            Write-Host "  BLOCKED: Forbidden file: $file" -ForegroundColor Red
            $violations++
            continue
        }
    }

    if ($file -match $binaryPattern) { continue }

    try {
        if ($Staged) {
            $content = git show ":$file" 2>$null
        } else {
            $content = Get-Content $file -Raw -ErrorAction Stop
        }
    } catch {
        continue
    }

    if (-not $content) { continue }

    if ($file -match '\.json$' -and $content -match $subscriptionPattern) {
        Write-Host "  BLOCKED: subscription field in $file" -ForegroundColor Red
        $violations++
    }

    if ($content -match $secretsPattern) {
        Write-Host "  BLOCKED: Secret/token in $file" -ForegroundColor Red
        $violations++
    }

    if ($file -match $textPattern) {
        if ($content -match $winPathPattern) {
            Write-Host "  BLOCKED: Windows path in $file" -ForegroundColor Red
            $violations++
        }

        if ($content -match $unixPathPattern) {
            Write-Host "  BLOCKED: Unix path in $file" -ForegroundColor Red
            $violations++
        }

        $localhostContent = if ($file -eq 'src-tauri/tauri.conf.json') {
            $content -replace 'http://localhost:1420', ''
        } else {
            $content
        }

        if ($localhostContent -match $localhostPattern) {
            Write-Host "  BLOCKED: Hardcoded localhost endpoint in $file" -ForegroundColor Red
            $violations++
        }
    }

    if ($file -match '__pycache__|\.pyc$|node_modules/') {
        Write-Host "  BLOCKED: Compiled/dependency file: $file" -ForegroundColor Red
        $violations++
    }
}

if ($violations -gt 0) {
    Write-Host "`n  COMMIT BLOCKED - $violations violation(s) found`n" -ForegroundColor Red
    exit 1
}

Write-Host "  Scan passed - no sensitive data detected`n" -ForegroundColor Green
exit 0
