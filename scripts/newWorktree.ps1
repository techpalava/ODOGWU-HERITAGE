<#
.SYNOPSIS
  Create a parallel-safe sibling worktree off fresh github/main (remote `github` only).
.EXAMPLE
  pwsh -NoProfile -File scripts/newWorktree.ps1 -Slug fix-footer-copy -Branch fix/footer-copy
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Slug,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._/-]+$')][string]$Branch
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
    # Simple function (uses $args) so git flags such as -b are passed through untouched.
    & git @args
    if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed with exit code $LASTEXITCODE" }
}

$baseCheckout = (& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $baseCheckout) { throw 'scripts/newWorktree.ps1 must live inside the repository checkout.' }
$baseCheckout = [System.IO.Path]::GetFullPath($baseCheckout)

Push-Location $baseCheckout
try {
    $remotes = @(& git remote)
    if ($remotes -notcontains 'github') { throw "Remote 'github' not found in $baseCheckout (never use 'origin')." }

    $parent = Split-Path -Parent $baseCheckout
    $target = Join-Path $parent "ODOGWU-HERITAGE-$Slug"
    if (Test-Path -LiteralPath $target) { throw "Target path already exists: $target (choose another -Slug; nothing was changed)." }

    & git show-ref --verify --quiet "refs/heads/$Branch"
    if ($LASTEXITCODE -eq 0) { throw "Local branch '$Branch' already exists (choose another -Branch; nothing was changed)." }

    Write-Host "==> git fetch github main"
    Invoke-Git fetch github main

    Write-Host "==> git worktree add $target -b $Branch github/main"
    Invoke-Git worktree add $target -b $Branch github/main

    $baseModules = Join-Path $baseCheckout 'node_modules'
    $targetModules = Join-Path $target 'node_modules'
    if ((Test-Path -LiteralPath $baseModules) -and -not (Test-Path -LiteralPath $targetModules)) {
        Write-Host "==> node_modules junction -> $baseModules"
        & cmd /c mklink /J "$targetModules" "$baseModules" | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Warning "mklink /J failed (exit $LASTEXITCODE); run npm ci in $target if needed." }
    }
    else {
        Write-Host '==> node_modules junction skipped (base has no node_modules or target already has one)'
    }

    $head = (& git -C $target rev-parse HEAD).Trim()
    $main = (& git -C $target rev-parse github/main).Trim()
    if ($head -ne $main) { throw "HEAD $head does not equal github/main $main in $target" }

    Write-Host "OK worktree=$target branch=$Branch HEAD=$head (== github/main)"
}
finally {
    Pop-Location
}
