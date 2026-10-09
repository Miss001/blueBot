# ASCII-only script for Windows PowerShell 5.1.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File this.ps1 -ExcludePids "1,2" [-Hwnd 0x...]
# Prints one JSON object to stdout: ok, title, processName, processId, text, textLength, error

param(
  [string]$ExcludePids = "",
  [string]$Hwnd = ""
)

$ErrorActionPreference = "Continue"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

function Emit-Result {
  param([hashtable]$Obj)
  $json = ($Obj | ConvertTo-Json -Compress -Depth 6)
  [Console]::Out.WriteLine($json)
}

try {
  Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop | Out-Null
  Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop | Out-Null
} catch {
  Emit-Result @{
    ok = $false
    title = ""
    processName = ""
    processId = 0
    text = ""
    textLength = 0
    error = ("Failed to load UIAutomation: " + $_.Exception.Message)
  }
  exit 0
}

$native = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class BlueBotNative {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  public const uint GW_HWNDNEXT = 2;
}
'@

try {
  Add-Type -TypeDefinition $native -ErrorAction Stop | Out-Null
} catch {
  # Type may already exist in this session
}

$exclude = New-Object 'System.Collections.Generic.HashSet[uint32]'
if ($ExcludePids -and $ExcludePids.Trim().Length -gt 0) {
  foreach ($part in $ExcludePids.Split(',')) {
    $t = $part.Trim()
    if ($t.Length -eq 0) { continue }
    try {
      [void]$exclude.Add([uint32]$t)
    } catch {}
  }
}

function Get-PidOf([IntPtr]$h) {
  $pidOut = [uint32]0
  [void][BlueBotNative]::GetWindowThreadProcessId($h, [ref]$pidOut)
  return $pidOut
}

function Get-TitleOf([IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 2048
  [void][BlueBotNative]::GetWindowText($h, $sb, $sb.Capacity)
  return $sb.ToString()
}

function Test-ShouldSkip([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return $true }
  if (-not [BlueBotNative]::IsWindowVisible($h)) { return $true }
  $pid = Get-PidOf $h
  if ($exclude.Contains($pid)) { return $true }
  $title = Get-TitleOf $h
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }
  if ($title -like 'blueBot*') { return $true }
  try {
    $pn = (Get-Process -Id $pid -ErrorAction Stop).ProcessName
    if ($pn -eq 'blueBot') { return $true }
  } catch {}
  return $false
}

function Find-TargetHwnd {
  if ($Hwnd -and $Hwnd.Trim().Length -gt 0) {
    $parsed = [IntPtr]::Zero
    try {
      if ($Hwnd -match '^0x') {
        $parsed = [IntPtr]([Convert]::ToInt64($Hwnd, 16))
      } else {
        $parsed = [IntPtr]([int64]$Hwnd)
      }
    } catch {
      $parsed = [IntPtr]::Zero
    }
    if ($parsed -ne [IntPtr]::Zero -and [BlueBotNative]::IsWindow($parsed)) {
      return $parsed
    }
  }

  $h = [BlueBotNative]::GetForegroundWindow()
  $guard = 0
  while ($h -ne [IntPtr]::Zero -and $guard -lt 60) {
    $guard++
    if (-not (Test-ShouldSkip $h)) {
      return $h
    }
    $h = [BlueBotNative]::GetWindow($h, [BlueBotNative]::GW_HWNDNEXT)
  }

  return [BlueBotNative]::GetForegroundWindow()
}

$target = Find-TargetHwnd
if ($target -eq [IntPtr]::Zero -or -not [BlueBotNative]::IsWindow($target)) {
  Emit-Result @{
    ok = $false
    title = ""
    processName = ""
    processId = 0
    text = ""
    textLength = 0
    error = "No usable foreground window found"
  }
  exit 0
}

$processId = [int](Get-PidOf $target)
$title = Get-TitleOf $target
$processName = ""
try {
  $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
} catch {
  $processName = ""
}

if ($exclude.Contains([uint32]$processId) -or ($title -like 'blueBot*')) {
  Emit-Result @{
    ok = $false
    title = $title
    processName = $processName
    processId = $processId
    text = ""
    textLength = 0
    error = "Foreground window is blueBot itself; switch to another app first"
  }
  exit 0
}

$element = $null
try {
  $element = [System.Windows.Automation.AutomationElement]::FromHandle($target)
} catch {
  Emit-Result @{
    ok = $true
    title = $title
    processName = $processName
    processId = $processId
    text = $title
    textLength = $title.Length
    truncated = $false
    nodeCount = 0
    error = ("UIA FromHandle failed; title only. " + $_.Exception.Message)
  }
  exit 0
}

if ($null -eq $element) {
  Emit-Result @{
    ok = $true
    title = $title
    processName = $processName
    processId = $processId
    text = $title
    textLength = $title.Length
    truncated = $false
    nodeCount = 0
    error = "AutomationElement was null; returned window title only"
  }
  exit 0
}

$maxChars = 50000
$maxNodes = 800
$sb = New-Object System.Text.StringBuilder
$script:nodeCount = 0
$script:maxChars = $maxChars
$script:maxNodes = $maxNodes
$script:sb = $sb

$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker

function Append-Text([string]$t) {
  if ([string]::IsNullOrWhiteSpace($t)) { return }
  if ($script:sb.Length -ge $script:maxChars) { return }
  $remain = $script:maxChars - $script:sb.Length
  if ($t.Length -gt $remain) { $t = $t.Substring(0, $remain) }
  if ($script:sb.Length -gt 0) { [void]$script:sb.Append([char]10) }
  [void]$script:sb.Append($t.Trim())
}

function Walk-Node($node, $depth) {
  if ($null -eq $node) { return }
  if ($script:nodeCount -ge $script:maxNodes) { return }
  if ($script:sb.Length -ge $script:maxChars) { return }
  if ($depth -gt 25) { return }

  $script:nodeCount++

  try {
    $ctrlType = $node.Current.ControlType
    $name = $node.Current.Name

    $interesting = $false
    if ($ctrlType -eq [System.Windows.Automation.ControlType]::Document) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::Edit) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::Text) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::ListItem) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::DataItem) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::Hyperlink) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::Button) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::ComboBox) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::TreeItem) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::HeaderItem) { $interesting = $true }
    elseif ($ctrlType -eq [System.Windows.Automation.ControlType]::TabItem) { $interesting = $true }

    if ($interesting) {
      Append-Text $name
    }

    try {
      $tp = $node.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      if ($null -ne $tp) {
        $range = $tp.DocumentRange
        if ($null -ne $range) {
          Append-Text ($range.GetText(8000))
        }
      }
    } catch {}

    try {
      $vp = $node.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($null -ne $vp) {
        $val = $vp.Current.Value
        if (-not [string]::IsNullOrWhiteSpace($val)) {
          Append-Text $val
        }
      }
    } catch {}
  } catch {}

  try {
    $child = $walker.GetFirstChild($node)
    while ($null -ne $child) {
      Walk-Node $child ($depth + 1)
      if ($script:sb.Length -ge $script:maxChars) { break }
      if ($script:nodeCount -ge $script:maxNodes) { break }
      $child = $walker.GetNextSibling($child)
    }
  } catch {}
}

try {
  Append-Text $element.Current.Name
} catch {}
Walk-Node $element 0

$text = $script:sb.ToString()
if ([string]::IsNullOrWhiteSpace($text)) {
  $text = $title
}

Emit-Result @{
  ok = $true
  title = $title
  processName = $processName
  processId = $processId
  text = $text
  textLength = $text.Length
  nodeCount = $script:nodeCount
  truncated = ($script:sb.Length -ge $maxChars)
}
