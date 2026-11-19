param([string]$Action, [string]$InputPath, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  if ($Action -eq 'voices') {
    $voices = @($speaker.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{ name = $_.VoiceInfo.Name; culture = $_.VoiceInfo.Culture.Name } })
    ConvertTo-Json -InputObject @{ voices = $voices } -Compress
  } elseif ($Action -eq 'speak') {
    $inputData = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $speaker.SelectVoice($inputData.voice)
    $speaker.SetOutputToWaveFile($OutputPath)
    $speaker.Speak([string]$inputData.text)
    $speaker.SetOutputToNull()
  } else { throw 'Unknown speech operation' }
} finally { $speaker.Dispose() }
