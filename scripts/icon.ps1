param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$frames = foreach ($size in 16,32,48,64,128,256) {
    $bmp = New-Object Drawing.Bitmap $size,$size
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.ScaleTransform($size / 64.0, $size / 64.0)
    $plate = New-Object Drawing.Drawing2D.GraphicsPath
    foreach ($arc in @(@(4,10,180),@(44,10,270),@(44,42,0),@(4,42,90))) {
        $plate.AddArc([int]$arc[0],[int]$arc[1],16,16,[int]$arc[2],90)
    }
    $plate.CloseFigure()
    $blue = [Drawing.ColorTranslator]::FromHtml('#236491')
    $ice = [Drawing.ColorTranslator]::FromHtml('#ebf8ff')
    $fill = New-Object Drawing.Drawing2D.LinearGradientBrush ([Drawing.Point]::new(9,10)),([Drawing.Point]::new(53,55)),$ice,([Drawing.ColorTranslator]::FromHtml('#83bdd7'))
    $pen = New-Object Drawing.Pen $blue,2
    $ink = New-Object Drawing.SolidBrush $blue
    $g.FillPath($fill,$plate); $g.DrawPath($pen,$plate)
    $g.DrawLine($pen,6,24,58,24)
    $pen.Width=4; $pen.StartCap='Round'; $pen.EndCap='Round'
    $g.DrawLine($pen,18,8,18,16); $g.DrawLine($pen,46,8,46,16)
    foreach ($y in 33,44) { foreach ($x in 17,29,41) { $g.FillEllipse($ink,$x,$y,5,5) } }
    $g.FillEllipse($ink,38,41,11,11)
    $stream = New-Object IO.MemoryStream
    $bmp.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
    [pscustomobject]@{Size=$size; Bytes=$stream.ToArray()}
    foreach ($resource in $stream,$ink,$pen,$fill,$plate,$g,$bmp) { $resource.Dispose() }
}
$output = [IO.File]::Create($Path)
$writer = New-Object IO.BinaryWriter $output
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $dimension=[byte]($frame.Size % 256); $writer.Write($dimension); $writer.Write($dimension)
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset); $offset+=$frame.Bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
} finally { $writer.Dispose(); $output.Dispose() }
