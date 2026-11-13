# Adds the app's bin folder to the user's PATH or takes it out; the Windows installer runs it on
# install and the uninstaller on uninstall (not on an update). Only the user's PATH is touched,
# never the machine's, and only the one entry: the rest stays as it was, %VARIABLES% unexpanded.
# With -Current it only prints what the PATH would become and writes nothing (the tests use it).
param(
  [Parameter(Mandatory = $true)][ValidateSet('add', 'remove')][string]$Action,
  [Parameter(Mandatory = $true)][string]$Dir,
  [string]$Current
)

function Get-Key([string]$entry) {
  return [Environment]::ExpandEnvironmentVariables($entry.Trim()).TrimEnd('\').ToLowerInvariant()
}

function Update-PathValue([string]$value, [string]$action, [string]$dir) {
  $entries = @($value -split ';' | Where-Object { $_.Trim() -ne '' })
  $key = Get-Key $dir
  $present = @($entries | Where-Object { (Get-Key $_) -eq $key }).Count -gt 0
  if ($action -eq 'add') {
    if ($present) { return $value }
    return (@($entries) + $dir) -join ';'
  }
  if (-not $present) { return $value }
  return @($entries | Where-Object { (Get-Key $_) -ne $key }) -join ';'
}

if ($PSBoundParameters.ContainsKey('Current')) {
  Write-Output (Update-PathValue $Current $Action $Dir)
  exit 0
}

$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
$value = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$next = Update-PathValue $value $Action $Dir
if ($next -ne $value) {
  if ($next -eq '') { $key.DeleteValue('Path', $false) }
  else { $key.SetValue('Path', $next, [Microsoft.Win32.RegistryValueKind]::ExpandString) }
  # Setting a variable through .NET tells running programs (Explorer, new terminals) that the
  # environment changed; the dummy goes away again at once.
  [Environment]::SetEnvironmentVariable('OTEA_PATH_CHANGED', '1', 'User')
  [Environment]::SetEnvironmentVariable('OTEA_PATH_CHANGED', $null, 'User')
}
$key.Close()
