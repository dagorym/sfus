# CI/CD Test System

This directory uses [Pester](https://pester.dev/), the PowerShell testing framework, for CI/CD contract validation.

Pester fits this part of the project because the CI/CD work is centered on PowerShell-friendly scripts and config files, and it is already available in the current development environment without adding new dependencies. The tests here validate shared CI/CD contracts such as the required config file locations and expected empty-matrix behavior.

## Setup

1. Use PowerShell on a machine with `Invoke-Pester` available.
2. Work from the repository root or the relevant isolated worktree root.
3. No additional package installation is currently required for the tests in this directory.

You can verify the test runner is available with:

```powershell
Get-Command Invoke-Pester
```

## Running the tests

Run the CI/CD contract tests from the worktree or repository root:

```powershell
Invoke-Pester -Path cicd\tests\shared-contracts.Tests.ps1 -PassThru
```

To run every Pester test placed in this directory in the future:

```powershell
Invoke-Pester -Path cicd\tests -PassThru
```

## Current coverage

- `shared-contracts.Tests.ps1`: validates that shared validation checks live under `cicd/config/validation-config.yml`
- `shared-contracts.Tests.ps1`: validates that image targets live under `cicd/config/image-matrix.yml`
- `shared-contracts.Tests.ps1`: validates that an empty image list is explicitly supported
