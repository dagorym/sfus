$cicdRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runnerPath = Join-Path $cicdRoot "scripts\run-validations.ps1"
$defaultConfigPath = Join-Path $cicdRoot "config\validation-config.yml"
$pwshPath = (Get-Process -Id $PID).Path

function Invoke-ValidationRunner {
    param(
        [string]$ConfigPath
    )

    $args = @("-NoProfile", "-File", $runnerPath)
    if ($ConfigPath) {
        $args += @("-ConfigPath", $ConfigPath)
    }

    $outputLines = & $pwshPath @args 2>&1
    $output = ($outputLines | ForEach-Object { $_.ToString() }) -join "`n"

    [pscustomobject]@{
        ExitCode = [int]$LASTEXITCODE
        Output   = $output
    }
}

Describe "run-validations.ps1" {
    It "AC1: executes validations declared under cicd/config/validation-config.yml" {
        Test-Path $runnerPath | Should Be $true
        Test-Path $defaultConfigPath | Should Be $true

        $result = Invoke-ValidationRunner

        $result.ExitCode | Should Be 0
        $result.Output | Should Match "==>\s+\[repo-structure-contract\]"
        $result.Output | Should Match "==>\s+\[local-parity-contract\]"
        $result.Output | Should Match "Validation summary:\s+total=2;\s+executed=1;\s+warnings=1;\s+failures=0"
    }

    It "AC2: emits warnings for unimplemented checks" {
        $result = Invoke-ValidationRunner

        $result.ExitCode | Should Be 0
        $result.Output | Should Match "(?i)Validation 'local-parity-contract' has no pwsh command configured; skipping\."
        $result.Output | Should Match "warnings=1"
    }

    It "AC3: warning-only runs exit successfully" {
        $configPath = Join-Path $TestDrive "warning-only-config.yml"
        @"
version: 1
defaults:
  warn_on_missing_command: true
validations:
  - id: check-a
    description: first warning-only check
    commands:
      pwsh: ""
  - id: check-b
    description: second warning-only check
    commands:
      pwsh: ""
"@ | Set-Content -LiteralPath $configPath

        $result = Invoke-ValidationRunner -ConfigPath $configPath

        $result.ExitCode | Should Be 0
        $result.Output | Should Match "Validation summary:\s+total=2;\s+executed=0;\s+warnings=2;\s+failures=0"
        $result.Output | Should Match "Completed with warnings only\."
    }

    It "Edge case: missing config path exits non-zero" {
        $missingPath = Join-Path $TestDrive "does-not-exist.yml"

        $result = Invoke-ValidationRunner -ConfigPath $missingPath

        $result.ExitCode | Should Be 1
        $result.Output | Should Match "Validation config not found:"
    }

    It "Edge case: warn_on_missing_command false treats missing command as failure" {
        $configPath = Join-Path $TestDrive "missing-command-fails.yml"
        @"
version: 1
defaults:
  warn_on_missing_command: false
validations:
  - id: missing-command
    description: should fail when command is missing
    commands:
      pwsh: ""
"@ | Set-Content -LiteralPath $configPath

        $result = Invoke-ValidationRunner -ConfigPath $configPath

        $result.ExitCode | Should Be 1
        $result.Output | Should Match "Error:\s+validation 'missing-command' has no pwsh command configured\."
        $result.Output | Should Match "Validation summary:\s+total=1;\s+executed=0;\s+warnings=0;\s+failures=1"
    }
}
