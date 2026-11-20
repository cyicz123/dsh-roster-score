$ErrorActionPreference = 'Stop'
$root = 'C:\Users\chengyue\Downloads\dsh-roster-score'
$python = 'C:\Users\chengyue\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$texts = @('八十五分', '九十六分', '七十三', '张伟九十五分')
$results = @()

$com = @'
$out = $args[0]
$text = $args[1]
$voice = New-Object -ComObject SAPI.SpVoice
$zh = $null
foreach ($v in $voice.GetVoices()) { if ($v.GetDescription() -match 'Huihui|Chinese') { $zh = $v } }
if (-not $zh) { throw 'no chinese voice' }
$voice.Voice = $zh
$format = New-Object -ComObject SAPI.SpAudioFormat
$format.Type = 14
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Format = $format
$stream.Open($out, 3, $false)
$voice.AudioOutputStream = $stream
$voice.Speak($text)
$stream.Close()
'@
$comPath = Join-Path $root 'scripts\_synth-once.ps1'
Set-Content -Path $comPath -Value $com -Encoding UTF8

$index = 0
foreach ($text in $texts) {
  $index += 1
  $raw = Join-Path $root ("samples\tts-$index-raw.wav")
  $wav = Join-Path $root ("samples\tts-$index.wav")
  powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File $comPath $raw $text | Out-Null
  & $python (Join-Path $root 'scripts\resample.py') $raw $wav | Out-Null
  $bytes = [IO.File]::ReadAllBytes($wav)
  $b64 = [Convert]::ToBase64String($bytes)
  $body = @{ audioBase64 = $b64; language = 'zh' } | ConvertTo-Json -Compress
  try {
    $ok = Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:8178/plugins/roster-score/transcribe' -ContentType 'application/json' -Body $body -TimeoutSec 180 -UseBasicParsing
    $results += [pscustomobject]@{ text = $text; status = [int]$ok.StatusCode; body = $ok.Content }
  } catch {
    $response = $_.Exception.Response
    $status = if ($response) { [int]$response.StatusCode } else { -1 }
    $content = ''
    if ($response) {
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Close()
    }
    $results += [pscustomobject]@{ text = $text; status = $status; body = $content }
  }
}
$results | ForEach-Object { "TEXT=$($_.text) STATUS=$($_.status) BODY=$($_.body)" }
