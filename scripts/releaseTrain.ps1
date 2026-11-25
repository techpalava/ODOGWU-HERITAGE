<#
.SYNOPSIS
  One-command ODOGWU HERITAGE release train (feature -> main, main -> production, production -> main).
.DESCRIPTION
  Remote `github` ONLY. Merge commits ONLY (`gh pr merge --merge --match-head-commit <headRefOid>`).
  Never squashes, rebases, force-pushes, or deletes `main`, `production`, or feature branches.
  -DryRun performs only read-only calls (git fetch, gh pr view/list/checks, GET /api/health) and
  prints every mutating command it would run.
.EXAMPLE
  pwsh -NoProfile -File scripts/releaseTrain.ps1 -DryRun
  pwsh -NoProfile -File scripts/releaseTrain.ps1 -PrNumber 1615
  pwsh -NoProfile -File scripts/releaseTrain.ps1 -Title "Release: batch of 2026-11-25"
#>
[CmdletBinding()]
param(
    [int]$PrNumber = 0,
    [string]$Title = '',
    [switch]$DryRun,
    [string]$Repo = 'techpalava/ODOGWU-HERITAGE',
    [string]$HealthUrl = 'https://odogwu-heritage.vercel.app/api/health',
    [int]$HealthTimeoutSec = 600,
    [int]$ChecksAppearTimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
$SyncTitle = 'Sync production release history back to main'
$script:FeatureWouldMerge = $false
$script:Mode = if ($DryRun) { 'DRY-RUN' } else { 'LIVE' }

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Plan([string]$Message) { Write-Host "    [DRY-RUN] would run: $Message" -ForegroundColor Yellow }

# Read-only git/gh helpers (simple functions so CLI flags pass straight through via $args).
function Invoke-Git {
    $out = & git @args
    if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed with exit code $LASTEXITCODE" }
    $out
}
function Invoke-GhRead {
    $out = & gh @args
    if ($LASTEXITCODE -ne 0) { throw "gh $($args -join ' ') failed with exit code $LASTEXITCODE" }
    $out
}
# Mutating gh calls: skipped (printed) in -DryRun.
function Invoke-GhWrite {
    if ($DryRun) { Write-Plan "gh $($args -join ' ')"; return $null }
    $out = & gh @args
    if ($LASTEXITCODE -ne 0) { throw "gh $($args -join ' ') failed with exit code $LASTEXITCODE" }
    $out
}

function Get-Pr([int]$Number) {
    (Invoke-GhRead pr view $Number --repo $Repo --json 'number,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,mergeCommit,url') | ConvertFrom-Json
}
function Find-OpenPr([string]$Base, [string]$Head) {
    $n = Invoke-GhRead pr list --repo $Repo --state open --base $Base --head $Head --json number --jq '.[0].number'
    if ($n) { [int]("$n".Trim()) } else { 0 }
}
function Wait-Checks([int]$Number) {
    if ($DryRun) {
        Write-Host "    current checks for #${Number} (read-only):"
        & gh pr checks $Number --repo $Repo 2>&1 | ForEach-Object { "      $_" } | Out-Host
        Write-Plan "gh pr checks $Number --repo $Repo --watch   (merge only if exit 0)"
        return
    }
    $deadline = (Get-Date).AddSeconds($ChecksAppearTimeoutSec)
    while ($true) {
        $probe = (& gh pr checks $Number --repo $Repo 2>&1 | Out-String)
        if ($probe -notmatch 'no checks reported') { break }
        if ((Get-Date) -gt $deadline) { throw "No checks appeared on #$Number within $ChecksAppearTimeoutSec s; not merging." }
        Start-Sleep -Seconds 10
    }
    & gh pr checks $Number --repo $Repo --watch | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Checks on #$Number did not pass (exit $LASTEXITCODE); not merging." }
}
function Merge-Pr([int]$Number) {
    $pr = Get-Pr $Number
    if ($pr.state -eq 'MERGED') { Write-Host "    #$Number already MERGED ($($pr.mergeCommit.oid)); skipping."; return $pr }
    if ($pr.state -ne 'OPEN') { throw "#$Number is $($pr.state); refusing to merge." }
    if ($pr.mergeable -eq 'CONFLICTING') { throw "#$Number has merge conflicts; stop." }
    if ($pr.isDraft) { Invoke-GhWrite pr ready $Number --repo $Repo | Out-Host }
    Wait-Checks $Number
    $head = $pr.headRefOid
    Write-Host "    #$Number $($pr.headRefName) -> $($pr.baseRefName) head=$head"
    # Never pass --squash/--rebase; --delete-branch=false keeps every branch.
    Invoke-GhWrite pr merge $Number --repo $Repo --merge --delete-branch=false --match-head-commit $head | Out-Host
    if ($DryRun) { return $pr }
    $after = Get-Pr $Number
    if ($after.state -ne 'MERGED') { throw "#$Number is $($after.state) after merge." }
    Write-Host "    MERGED #$Number mergeCommit=$($after.mergeCommit.oid)" -ForegroundColor Green
    $after
}
function Test-ProdIsAncestorOfMain {
    & git merge-base --is-ancestor github/production github/main
    $LASTEXITCODE -eq 0
}

Write-Host "ODOGWU release train [$script:Mode] repo=$Repo"
if (@(& git remote) -notcontains 'github') { throw "Remote 'github' not found (never use 'origin')." }
$null = Invoke-GhRead auth status 2>&1
$summary = [ordered]@{}

# Step 1 — feature PR -> main
if ($PrNumber -gt 0) {
    Write-Step "Step 1: feature PR #$PrNumber -> main"
    $feature = Get-Pr $PrNumber
    if ($feature.baseRefName -ne 'main') { throw "#$PrNumber targets '$($feature.baseRefName)', expected 'main'." }
    $r = Merge-Pr $PrNumber
    if ($DryRun -and $r.state -ne 'MERGED') { $script:FeatureWouldMerge = $true }
    $summary['PR1'] = "#$PrNumber $($r.state) $($r.mergeCommit.oid)"
}
else {
    Write-Step 'Step 1: skipped (no -PrNumber; promoting what is already on main)'
}

# Step 2 — main -> production
Write-Step 'Step 2: main -> production'
Invoke-Git fetch github main production | Out-Host
$pending = (Invoke-Git diff --stat github/production...github/main | Out-String).Trim()
$prodPr = 0
if (-not $pending) {
    Write-Host '    github/main has no changes beyond github/production; nothing to promote.'
    if ($script:FeatureWouldMerge) { Write-Plan "after #$PrNumber merges: create/reuse main -> production PR, gh pr checks --watch, gh pr merge --merge --delete-branch=false --match-head-commit <headRefOid>; then Step 3 sync PR '$SyncTitle'" }
}
else {
    Write-Host $pending
    $prodPr = Find-OpenPr 'production' 'main'
    if ($prodPr -eq 0) {
        $t = if ($Title) { $Title } elseif ($PrNumber -gt 0) { "Release: Merge main into production (PR #$PrNumber)" } else { 'Release: Merge main into production' }
        $body = "Promotes github/main $((Invoke-Git rev-parse github/main).Trim()) to production via merge commit (scripts/releaseTrain.ps1)."
        $created = Invoke-GhWrite pr create --repo $Repo --base production --head main --title $t --body $body
        if ($created) { $created | Out-Host }
        if (-not $DryRun) { $prodPr = Find-OpenPr 'production' 'main' }
    }
    else { Write-Host "    Reusing open main -> production PR #$prodPr" }
    if ($prodPr -gt 0) {
        $r = Merge-Pr $prodPr
        $summary['PR2'] = "#$prodPr $($r.state) $($r.mergeCommit.oid)"
    }
    elseif ($DryRun) { Write-Plan "gh pr merge <new PR> --repo $Repo --merge --delete-branch=false --match-head-commit <headRefOid>" }
    else { throw 'Could not find the main -> production PR after creating it.' }
}

# Step 3 — production -> main history sync
Write-Step 'Step 3: production -> main back-merge'
Invoke-Git fetch github main production | Out-Host
$syncPr = Find-OpenPr 'main' 'production'
if ($syncPr -eq 0 -and (Test-ProdIsAncestorOfMain)) {
    if ($DryRun -and $pending) {
        Write-Plan "gh pr create --repo $Repo --base main --head production --title `"$SyncTitle`" (after Step 2 merges), then merge --merge --match-head-commit <headRefOid>"
    }
    else { Write-Host '    github/production is already an ancestor of github/main; no sync PR needed.' }
}
else {
    if ($syncPr -eq 0) {
        $created = Invoke-GhWrite pr create --repo $Repo --base main --head production --title $SyncTitle --body 'Back-merges production release history into main via merge commit (scripts/releaseTrain.ps1).'
        if ($created) { $created | Out-Host }
        if (-not $DryRun) { $syncPr = Find-OpenPr 'main' 'production' }
    }
    else { Write-Host "    Reusing open production -> main PR #$syncPr" }
    if ($syncPr -gt 0) {
        $r = Merge-Pr $syncPr
        $summary['PR3'] = "#$syncPr $($r.state) $($r.mergeCommit.oid)"
    }
    elseif ($DryRun) { Write-Plan "gh pr merge <sync PR> --repo $Repo --merge --delete-branch=false --match-head-commit <headRefOid>" }
    else { throw 'Could not find the production -> main sync PR after creating it.' }
}

# Step 4 — parity, ancestry, live buildId
Write-Step 'Step 4: parity, ancestry & live /api/health'
Invoke-Git fetch github main production | Out-Host
$diffStat = (Invoke-Git diff --stat github/main..github/production | Out-String).Trim()
& git diff --quiet github/main github/production
$contentExit = $LASTEXITCODE
& git merge-base --is-ancestor github/production github/main
$ancestryExit = $LASTEXITCODE
$mainHead = (Invoke-Git rev-parse github/main).Trim()
$prodHead = (Invoke-Git rev-parse github/production).Trim()
$mainTree = (Invoke-Git rev-parse 'github/main^{tree}').Trim()
$prodTree = (Invoke-Git rev-parse 'github/production^{tree}').Trim()
Write-Host "    github/main=$mainHead (tree=$mainTree)"
Write-Host "    github/production=$prodHead (tree=$prodTree)"
Write-Host "    diff --stat main..production: $(if ($diffStat) { "`n$diffStat" } else { '(empty)' })"
Write-Host "    contentExit=$contentExit ancestryExit=$ancestryExit"
$parityOk = (-not $diffStat) -and $contentExit -eq 0 -and $ancestryExit -eq 0 -and $mainTree -eq $prodTree
if (-not $parityOk) {
    if ($DryRun) { Write-Warning 'Parity/ancestry not satisfied yet (expected before a real run completes the train).' }
    else { throw 'Parity/ancestry verification FAILED.' }
}

$buildId = $null
$deadline = (Get-Date).AddSeconds($(if ($DryRun) { 20 } else { $HealthTimeoutSec }))
do {
    try {
        $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 15 -Headers @{ 'Cache-Control' = 'no-cache' }
        $buildId = "$($health.buildId)"
    }
    catch { Write-Host "    health probe failed: $($_.Exception.Message)" }
    if ($DryRun -or $buildId -eq $prodHead) { break }
    Write-Host "    live buildId=$buildId, waiting for $prodHead ..."
    Start-Sleep -Seconds 15
} while ((Get-Date) -lt $deadline)

$summary['main'] = "$mainHead tree=$mainTree"
$summary['production'] = "$prodHead tree=$prodTree"
$summary['liveBuildId'] = $buildId
Write-Host "`n==> Summary [$script:Mode]"
$summary.GetEnumerator() | ForEach-Object { Write-Host ("    {0,-12} {1}" -f $_.Key, $_.Value) }
if ($buildId -eq $prodHead) { Write-Host '    Live /api/health buildId matches github/production.' -ForegroundColor Green }
elseif (-not $DryRun) { throw "Live buildId '$buildId' did not reach $prodHead within $HealthTimeoutSec s." }
else { Write-Host "    [DRY-RUN] live buildId=$buildId (production head $prodHead)" }
exit 0
