$cicdRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$validationConfigPath = Join-Path $cicdRoot "config\validation-config.yml"
$imageMatrixPath = Join-Path $cicdRoot "config\image-matrix.yml"

Describe "Shared CI/CD contracts" {
    It "AC1: declares validation checks under cicd/config/validation-config.yml" {
        Test-Path $validationConfigPath | Should Be $true

        $validationConfig = Get-Content -Raw $validationConfigPath

        # Acceptance criteria: validation checks are declared under cicd/config.
        $validationConfig | Should Match "(?ms)^validations:\s*\r?\n\s*-\s+id:\s+\S+"
        $validationConfig | Should Match "(?ms)commands:\s*\r?\n\s*sh:\s*.*\r?\n\s*pwsh:\s*.*"
    }

    It "AC1: declares image targets under cicd/config/image-matrix.yml" {
        Test-Path $imageMatrixPath | Should Be $true

        $imageMatrix = Get-Content -Raw $imageMatrixPath

        # Acceptance criteria: image targets are declared under cicd/config.
        $imageMatrix | Should Match "(?m)^images:\s*(\[\]|\r?$)"
    }

    It "AC1: explicitly supports an empty image list" {
        $imageMatrix = Get-Content -Raw $imageMatrixPath

        # Acceptance criteria: the empty list behavior is called out, not implied.
        $imageMatrix | Should Match "(?m)^#\s*An empty image list is valid and should warn while exiting successfully\."
        $imageMatrix | Should Match "(?m)^images:\s*\[\]\s*$"
    }
}
