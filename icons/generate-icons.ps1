# Daily Tracker — stopwatch PWA icon generator (Windows PowerShell + System.Drawing)
# Draws icon-192.png, icon-180.png, icon-512.png, icon-512-maskable.png to match icons/icon.svg.
# Re-run after changing the SVG style so the manifest PNGs stay in sync.

Add-Type -AssemblyName System.Drawing

function Draw-Stopwatch {
  param([int]$S)
  $bmp = New-Object System.Drawing.Bitmap($S, $S)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  $bg   = [System.Drawing.ColorTranslator]::FromHtml("#161227")
  $gold = [System.Drawing.ColorTranslator]::FromHtml("#e8b355")
  $lgold= [System.Drawing.ColorTranslator]::FromHtml("#f4d9a3")
  $dim  = [System.Drawing.ColorTranslator]::FromHtml("#6b5636")
  $ring = [System.Drawing.ColorTranslator]::FromHtml("#3b3158")
  $half = [double]$S / 2.0
  $f    = [double]$S / 512.0   # scale factor

  # Body: dark circle
  $bodyR = 224.0 * $f
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($bg)), ($half - $bodyR), ($half - $bodyR + 16 * $f), (2 * $bodyR), (2 * $bodyR))

  # Gold ring
  $ringPen = New-Object System.Drawing.Pen($gold, ([float](7.0 * $f)))
  $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ringR = 224.0 * $f
  $g.DrawEllipse($ringPen, ($half - $ringR), ($half - $ringR + 16 * $f), (2 * $ringR), (2 * $ringR))

  # Inner subtle ring
  $innerPen = New-Object System.Drawing.Pen($ring, ([float](1.5 * $f)))
  $innerR = 205.0 * $f
  $g.DrawEllipse($innerPen, ($half - $innerR), ($half - $innerR + 16 * $f), (2 * $innerR), (2 * $innerR))

  # Crown (rect + circle at top)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($gold)), ($half - 12 * $f), (16 * $f), (24 * $f), (40 * $f))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($lgold)), ($half - 14 * $f), (4 * $f), (28 * $f), (28 * $f))

  # Side button (right)
  $sbPen = New-Object System.Drawing.Pen([System.Drawing.Brushes]::Transparent, 0)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($gold)), ($half + 196 * $f), ($half - 58 * $f), (30 * $f), (16 * $f))

  # Ticks
  $tickPenGold = New-Object System.Drawing.Pen($gold, ([float](3.5 * $f)))
  $tickPenGold.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $tickPenGold.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $tickPenDim = New-Object System.Drawing.Pen($dim, ([float](2.0 * $f)))
  $tickPenDim.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $tickPenDim.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $centerY = $half + 16 * $f
  for ($h = 0; $h -lt 12; $h++) {
    $ang = ($h * 30 - 90) * [Math]::PI / 180
    $ro = 175.0 * $f
    $ri = if ($h % 3 -eq 0) { 158.0 * $f } else { 163.0 * $f }
    $x1 = $half + $ro * [Math]::Cos($ang)
    $y1 = $centerY + $ro * [Math]::Sin($ang)
    $x2 = $half + $ri * [Math]::Cos($ang)
    $y2 = $centerY + $ri * [Math]::Sin($ang)
    $brush = if ($h % 3 -eq 0) { $tickPenGold } else { $tickPenDim }
    $g.DrawLine($brush, $x1, $y1, $x2, $y2)
  }

  # Hour hand (~10 o'clock: 300 deg -> clockwise 60 deg from vertical)
  $handPen = New-Object System.Drawing.Pen($lgold, ([float](7.0 * $f)))
  $handPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $handPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($handPen, $half, $centerY, ($half - 82 * $f), ($centerY - 62 * $f))

  # Minute hand (12 o'clock)
  $minPen = New-Object System.Drawing.Pen($gold, ([float](4.5 * $f)))
  $minPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $minPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($minPen, $half, $centerY, $half, ($centerY - 152 * $f))

  # Center pivot
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($gold)), ($half - 10 * $f), ($centerY - 10 * $f), (20 * $f), (20 * $f))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($bg)), ($half - 4.5 * $f), ($centerY - 4.5 * $f), (9 * $f), (9 * $f))

  $g.Dispose()
  return $bmp
}

function Save-Maskable {
  param($InBmp, $Size, $Path)
  $out = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml("#161227"))
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $safe = $Size * 0.62
  $ox = ($Size - $safe) / 2
  $g.DrawImage($InBmp, $ox, $ox, $safe, $safe)
  $g.Dispose()
  $out.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

$icon192 = Draw-Stopwatch -S 192
$icon192.Save((Join-Path $dir "icon-192.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$icon192.Dispose()

$icon180 = Draw-Stopwatch -S 180
$icon180.Save((Join-Path $dir "icon-180.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$icon180.Dispose()

$icon512 = Draw-Stopwatch -S 512
$icon512.Save((Join-Path $dir "icon-512.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Save-Maskable -InBmp $icon512 -Size 512 -Path (Join-Path $dir "icon-512-maskable.png")
$icon512.Dispose()

Write-Host "Icons written to $dir"