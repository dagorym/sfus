#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$ConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ScalarValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RawValue
    )

    $value = $RawValue.Trim()

    if ($value -in @("null", "~")) {
        return ""
    }

    if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
        return ($value.Substring(1, $value.Length - 2) -replace '\\"', '"')
    }

    if ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) {
        return ($value.Substring(1, $value.Length - 2) -replace "''", "'")
    }

    return $value
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $PSBoundParameters.ContainsKey("ConfigPath")) {
    $ConfigPath = Join-Path $repoRoot "cicd\config\validation-config.yml"
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    [Console]::Error.WriteLine("Validation config not found: $ConfigPath")
    exit 1
}

$resolvedConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$configLines = Get-Content -LiteralPath $resolvedConfigPath

$warnOnMissingCommand = $true
$validations = [System.Collections.Generic.List[object]]::new()
$currentValidation = $null

foreach ($line in $configLines) {
    if ($line -match '^\s*warn_on_missing_command:\s*(.+?)\s*$') {
        $warnRaw = (Get-ScalarValue -RawValue $Matches[1]).ToLowerInvariant()
        $warnOnMissingCommand = -not ($warnRaw -in @("false", "no", "off", "0"))
        continue
    }

    if ($line -match '^\s*-\s+id:\s*(.+?)\s*$') {
        if ($null -ne $currentValidation) {
            $validations.Add($currentValidation)
        }

        $currentValidation = [ordered]@{
            Id          = Get-ScalarValue -RawValue $Matches[1]
            Description = ""
            Command     = ""
        }

        continue
    }

    if ($null -eq $currentValidation) {
        continue
    }

    if ($line -match '^\s*description:\s*(.+?)\s*$') {
        $currentValidation.Description = Get-ScalarValue -RawValue $Matches[1]
        continue
    }

    if ($line -match '^\s*pwsh:\s*(.*)$') {
        $currentValidation.Command = Get-ScalarValue -RawValue $Matches[1]
    }
}

if ($null -ne $currentValidation) {
    $validations.Add($currentValidation)
}

if ($validations.Count -eq 0) {
    Write-Warning "No validations defined in $resolvedConfigPath"
    exit 0
}

$executed = 0
$warnings = 0
$failures = 0

Push-Location $repoRoot
try {
    foreach ($validation in $validations) {
        $id = [string]$validation.Id
        $description = [string]$validation.Description
        $command = [string]$validation.Command

        if ([string]::IsNullOrWhiteSpace($description)) {
            Write-Host "==> [$id]"
        }
        else {
            Write-Host "==> [$id] $description"
        }

        if ([string]::IsNullOrWhiteSpace($command)) {
            if ($warnOnMissingCommand) {
            Write-Warning "Validation '$id' has no pwsh command configured; skipping."
                $warnings++
                continue
            }

            [Console]::Error.WriteLine("Error: validation '$id' has no pwsh command configured.")
            $failures++
            continue
        }

        Write-Host "Running: $command"

        try {
            $global:LASTEXITCODE = 0
            $result = & ([ScriptBlock]::Create($command))
            $exitCode = [int]$LASTEXITCODE
            $boolFailed = ($result -is [bool] -and -not $result)

            if ($exitCode -ne 0 -or $boolFailed) {
                [Console]::Error.WriteLine("Error: validation '$id' failed.")
                $failures++
                continue
            }

            $executed++
        }
        catch {
            [Console]::Error.WriteLine("Error: validation '$id' failed: $($_.Exception.Message)")
            $failures++
        }
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Validation summary: total=$($validations.Count); executed=$executed; warnings=$warnings; failures=$failures"

if ($failures -gt 0) {
    exit 1
}

if ($executed -eq 0 -and $warnings -gt 0) {
    Write-Host "Completed with warnings only."
}

exit 0
