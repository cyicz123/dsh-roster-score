$out = 'C:\Users\chengyue\Downloads\dsh-roster-score\samples\say-85.wav'
if (Test-Path $out) { Remove-Item $out -Force }
$voice = New-Object -ComObject SAPI.SpVoice
$zh = $null
foreach ($v in $voice.GetVoices()) { if ($v.GetDescription() -match 'Huihui|Chinese') { $zh = $v } }
if (-not $zh) { Write-Output 'no chinese voice'; exit 1 }
$voice.Voice = $zh
$format = New-Object -ComObject SAPI.SpAudioFormat
$format.Type = 14
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Format = $format
$stream.Open($out, 3, $false)
$voice.AudioOutputStream = $stream
$voice.Speak('八十五分')
$stream.Close()
if (Test-Path $out) { Write-Output ('bytes: ' + (Get-Item $out).Length) } else { Write-Output 'missing' }
