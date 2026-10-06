$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location $projectRoot
try {
    $checks = @(
        @{ Command = 'npm'; Arguments = @('run', 'test', '--prefix', 'backend') },
        @{ Command = 'npm'; Arguments = @('run', 'test:e2e', '--prefix', 'backend') },
        @{ Command = 'node'; Arguments = @('--test', 'frontend/test/holidays.test.mjs') },
        @{ Command = 'npm'; Arguments = @('run', 'lint', '--prefix', 'backend') },
        @{ Command = 'npm'; Arguments = @('run', 'lint', '--prefix', 'frontend') },
        @{ Command = 'npm'; Arguments = @('run', 'build', '--prefix', 'frontend') },
        @{ Command = 'npm'; Arguments = @('run', 'typecheck', '--prefix', 'backend') }
    )
    foreach ($check in $checks) {
        Write-Host "`n> $($check.Command) $($check.Arguments -join ' ')"
        $checkArguments = $check.Arguments
        & $check.Command @checkArguments
        if ($LASTEXITCODE -ne 0) { throw "Quality gate failed (exit $LASTEXITCODE)" }
    }
    Write-Host "`nAll quality gates passed."
} finally {
    Pop-Location
}
