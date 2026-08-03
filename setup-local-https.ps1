# Creates a self-signed certificate for HTTPS local previews of this site.
#
# Run once, then start the dev server with:
#   node worker/test-local.mjs --https
# and open https://127.0.0.1:8787/admin/ in your browser.
#
# The certificate is generated for "localhost" and "127.0.0.1", exported into
# the (gitignored) certs/ folder, and removed from the Windows certificate
# store again so nothing lingers on the machine.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$certDir = Join-Path $root "certs"
New-Item -ItemType Directory -Path $certDir -Force | Out-Null

$thumbprint = $null
try {
  $cert = New-SelfSignedCertificate `
    -Subject "CN=localhost" `
    -TextExtension @("2.5.29.17={text}DNS=localhost&IPAddress=127.0.0.1") `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -FriendlyName "57FIFTYSEVEN local dev" `
    -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -NotBefore (Get-Date).AddDays(-1) `
    -NotAfter (Get-Date).AddYears(1)
  $thumbprint = $cert.Thumbprint

  # PEM copy of the certificate only (handy for tools that expect .crt/.key).
  $certPem = "-----BEGIN CERTIFICATE-----`n" +
    [Convert]::ToBase64String($cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks) +
    "`n-----END CERTIFICATE-----`n"
  Set-Content -Path (Join-Path $certDir "localhost.crt") -Value $certPem -Encoding ASCII

  # PKCS#12 bundle with the private key, which the Node dev server loads.
  $passphrase = [Guid]::NewGuid().ToString("N")
  Export-PfxCertificate `
    -Cert $cert `
    -FilePath (Join-Path $certDir "localhost.pfx") `
    -Password (ConvertTo-SecureString -String $passphrase -AsPlainText -Force) `
    -Force | Out-Null
  Set-Content -Path (Join-Path $certDir "localhost.pfx.pass") -Value $passphrase -Encoding ASCII
}
finally {
  if ($thumbprint) {
    Remove-Item "Cert:\CurrentUser\My\$thumbprint" -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "Local HTTPS certificate created in .\certs\ (gitignored)."
Write-Host "Start the dev server with:"
Write-Host "  node worker/test-local.mjs --https"
Write-Host "Then open https://127.0.0.1:8787/admin/ in your browser."
Write-Host ""
Write-Host "Note: the certificate is self-signed, so your browser will show a"
Write-Host "one-time warning before you continue. That is expected and safe for"
Write-Host "local development; the deployed site uses Cloudflare's own certificate."
