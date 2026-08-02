# One-time setup: commit the site and push it to GitHub (auto-deploy repo)
Set-Location -LiteralPath $PSScriptRoot

# Use the portable Git that ships with this machine (not on the normal PATH)
$gitDir = "C:\Users\57\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd"
if (Test-Path -LiteralPath "$gitDir\git.exe") {
  $env:Path = "$gitDir;$env:Path"
  Write-Host "Using git: $gitDir\git.exe"
} else {
  Write-Host "ERROR: git not found at $gitDir`git.exe"
  exit 1
}

# Remove the broken/empty .git folder if present from an earlier interrupted setup
$gitPath = Join-Path $PSScriptRoot ".git"
if (Test-Path -LiteralPath $gitPath) {
  Remove-Item -LiteralPath $gitPath -Recurse -Force
}

git init -b main
if ($LASTEXITCODE -ne 0) { exit 1 }

git add .
git -c user.name="57cincuentasiete" -c user.email="57cincuentasiete@gmail.com" commit -m "Initial site scaffold"
if ($LASTEXITCODE -ne 0) { exit 1 }

git remote remove origin 2>$null
git remote add origin https://github.com/57cincuentasiete/57-own-website.git
git push -u origin main

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "SUCCESS: site pushed to https://github.com/57cincuentasiete/57-own-website"
} else {
  Write-Host ""
  Write-Host "Push failed. You may need a GitHub login or access token."
  Write-Host "1. If a login window pops up, sign in as 57cincuentasiete and run this script again."
  Write-Host "2. If it asks for a password, create a token at https://github.com/settings/tokens (repo scope) and paste it as the password."
}
