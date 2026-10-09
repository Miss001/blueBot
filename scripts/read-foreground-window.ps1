# Reads the foreground (or specified) window text via UI Automation.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File read-foreground-window.ps1 [-ExcludePids "123,456"] [-Hwnd 0x...]
# Outputs a single JSON object to stdout.

param(
  [string]$ExcludePids = "",
  [string]$Hwnd = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Json($obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 6
  [Console]::Out.WriteLine($json)
}

try {
  Add-Type -AssemblyName UIAutomationClient | Out-Null
  Add-Type -AssemblyName UIAutomationTypes | Out-Null
} catch {
  Write-Json @{ ok = $false; error = "无法加载 UIAutomation 程序集: $($_.Exception.Message)" }
  exit 0
}

$native = @"
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
"@

try {
  Add-Type -TypeDefinition $native -ErrorAction Stop | Out-Null
} catch {
  # type may already exist in session
}

$exclude = @()
if ($ExcludePids) {
  $exclude = $ExcludePids.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" } | ForEach-Object { [uint32]$_ }
}

function Get-PidOf($h) {
  $pidOut = [uint32]0
  [void][BlueBotNative]::GetWindowThreadProcessId($h, [ref]$pidOut)
  return $pidOut
}

function Get-TitleOf($h) {
  $sb = New-Object System.Text.StringBuilder 1024
  [void][BlueBotNative]::GetWindowText($h, $sb, $sb.Capacity)
  return $sb.ToString()
}

function Find-TargetHwnd {
  if ($Hwnd) {
    $parsed = [IntPtr]::Zero
    if ($Hwnd -match '^0x') {
      $parsed = [IntPtr]([Convert]::ToInt64($Hwnd, 16))
    } else {
      $parsed = [IntPtr]([int64]$Hwnd)
    }
    if ([BlueBotNative]::IsWindow($parsed)) { return $parsed }
  }

  $h = [BlueBotNative]::GetForegroundWindow()
  $guard = 0
  while ($h -ne [IntPtr]::Zero -and $guard -lt 40) {
    $guard++
    if (-not [BlueBotNative]::IsWindowVisible($h)) {
      $h = [BlueBotNative]::GetWindow($h, [BlueBotNative]::GW_HWNDNEXT)
      continue
    }
    $pid = Get-PidOf $h
    $title = Get-TitleOf $h
    $skip = $false
    if ($exclude -contains $pid) { $skip = $true }
    if ($title -match '^(blueBot|blueBot 对话)') { $skip = $true }
    if (-not $skip -and $title) { return $h }
    $h = [BlueBotNative]::GetWindow($h, [BlueBotNative]::GW_HWNDNEXT)
  }
  return [BlueBotNative]::GetForegroundWindow()
}

$target = Find-TargetHwnd
if ($target -eq [IntPtr]::Zero -or -not [BlueBotNative]::IsWindow($target)) {
  Write-Json @{ ok = $false; error = "未找到可用的前台窗口" }
  exit 0
}

$processId = Get-PidOf $target
$title = Get-TitleOf $target
$processName = ""
try {
  $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
} catch {
  $processName = ""
}

try {
  $element = [System.Windows.Automation.AutomationElement]::FromHandle($target)
} catch {
  Write-Json @{
    ok = $false
    title = $title
    processName = $processName
    processId = $processId
    error = "无法绑定 UI Automation：$($_.Exception.Message)。若目标为管理员窗口，请以管理员运行 blueBot；浏览器页面可能需开启辅助功能。"
  }
  exit 0
}

if ($null -eq $element) {
  Write-Json @{
    ok = $false
    title = $title
    processName = $processName
    processId = $processId
    error = "AutomationElement 为空"
  }
  exit 0
}

$maxChars = 50000
$maxNodes = 800
$sb = New-Object System.Text.StringBuilder
$nodeCount = 0

$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker

function Append-Text([string]$t) {
  if ([string]::IsNullOrWhiteSpace($t)) { return }
  if ($script:sb.Length -ge $script:maxChars) { return }
  $remain = $script:maxChars - $script:sb.Length
  if ($t.Length -gt $remain) { $t = $t.Substring(0, $remain) }
  if ($script:sb.Length -gt 0) { [void]$script:sb.AppendLine() }
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

    $interesting =
      $ctrlType -eq [System.Windows.Automation.ControlType]::Document -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::Edit -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::Text -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::ListItem -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::DataItem -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::Hyperlink -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::Button -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::ComboBox -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::TreeItem -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::HeaderItem -or
      $ctrlType -eq [System.Windows.Automation.ControlType]::TabItem

    if ($interesting) {
      Append-Text $name
    }

    # TextPattern
    try {
      $tp = $node.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      if ($null -ne $tp) {
        $range = $tp.DocumentRange
        if ($null -ne $range) {
          $txt = $range.GetText(8000)
          Append-Text $txt
        }
      }
    } catch {}

    # ValuePattern
    try {
      $vp = $node.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($null -ne $vp -and -not [string]::IsNullOrWhiteSpace($vp.Current.Value)) {
        Append-Text $vp.Current.Value
      }
    } catch {}
  } catch {}

  try {
    $child = $walker.GetFirstChild($node)
    while ($null -ne $child) {
      Walk-Node $child ($depth + 1)
      if ($script:sb.Length -ge $script:maxChars -or $script:nodeCount -ge $script:maxNodes) { break }
      $child = $walker.GetNextSibling($child)
    }
  } catch {}
}

# Prefer name of window first
Append-Text $element.Current.Name
Walk-Node $element 0

$text = $sb.ToString()
if ([string]::IsNullOrWhiteSpace($text)) {
  $text = $title
}

Write-Json @{
  ok = $true
  title = $title
  processName = $processName
  processId = $processId
  text = $text
  textLength = $text.Length
  nodeCount = $nodeCount
  truncated = ($sb.Length -ge $maxChars)
}
