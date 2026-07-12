# Link local textbook PDFs into public/references/ (hard links, no duplicate disk use).
$root = Split-Path -Parent $PSScriptRoot
$pub = Join-Path $root "public\references"
$docs = "C:\Users\peter\Downloads\Documents"
$links = @{
  "calculus-volume-1_-_WEB.pdf" = Join-Path $docs "calculus-volume-1_-_WEB.pdf"
  "027458583.pdf"                 = Join-Path $docs "027458583.pdf"
}

New-Item -ItemType Directory -Force -Path $pub | Out-Null

foreach ($name in $links.Keys) {
  $target = $links[$name]
  $link = Join-Path $pub $name
  if (-not (Test-Path $target)) {
    Write-Warning "Missing source PDF: $target"
    continue
  }
  if (Test-Path $link) {
    Write-Host "Already linked: $name"
    continue
  }
  cmd /c mklink /H "`"$link`"" "`"$target`""
  if ($LASTEXITCODE -eq 0) { Write-Host "Linked $name" }
}