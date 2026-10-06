' HoYoSalon - mở Launcher KHÔNG hiện cửa sổ đen (Zero-Terminal).
'   Lối tắt "Hương Sen Salon" trên màn hình (tự tạo lần đầu) trỏ vào tệp này qua wscript.exe.
'   HoYoSalon.bat cũng chỉ chuyển sang đây rồi đóng ngay.
' Tệp lưu dạng UTF-16 LE (Git tự chuyển, xem .gitattributes) để Windows Script Host hiển thị đúng tiếng Việt.
Option Explicit
Dim sh, fso, root, rc, args, i, desk, lnkPath, lnk, marker, logFile

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
sh.CurrentDirectory = root

' 1. Node.js 20 trở lên (chạy ẩn, chỉ lấy mã thoát)
rc = sh.Run("cmd.exe /d /c node -e ""process.exit(parseInt(process.versions.node,10)>=20?0:1)""", 0, True)
If rc <> 0 Then
  If MsgBox("Máy chưa cài Node.js 20 trở lên nên chưa mở được Hương Sen Salon." & vbCrLf & vbCrLf & _
            "Bấm Yes để mở trang tải Node.js (chọn bản LTS), cài xong mở lại biểu tượng Hương Sen Salon.", _
            vbYesNo + vbExclamation, "Hương Sen Salon") = vbYes Then sh.Run "https://nodejs.org/vi/download"
  WScript.Quit 1
End If

' 2. Lối tắt trên màn hình: tạo MỘT lần (xoá đi thì không tự tạo lại); bỏ qua bằng tham số --no-shortcut
marker = root & "\.salon-shortcut"
If Not fso.FileExists(marker) And Not HasArg("--no-shortcut") Then
  On Error Resume Next
  desk = sh.SpecialFolders("Desktop")
  lnkPath = desk & "\Hương Sen Salon.lnk"
  Set lnk = sh.CreateShortcut(lnkPath)
  lnk.TargetPath = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
  lnk.Arguments = "//nologo """ & WScript.ScriptFullName & """"
  lnk.WorkingDirectory = root
  lnk.IconLocation = root & "\scripts\hoyo\ui\hoyosalon.ico,0"
  lnk.Description = "Hương Sen Salon - Launcher hệ thống đặt lịch"
  lnk.Save
  If Err.Number = 0 Then fso.CreateTextFile(marker, True).WriteLine lnkPath
  Err.Clear
  On Error GoTo 0
End If

' 3. Chạy máy chủ Launcher ẩn (cửa sổ 0) và chờ; Launcher tự mở cửa sổ giao diện của nó
args = ""
For i = 0 To WScript.Arguments.Count - 1
  args = args & " """ & WScript.Arguments(i) & """"
Next
rc = sh.Run("node """ & root & "\scripts\hoyo\launcher-ui.mjs""" & args, 0, True)
If rc <> 0 Then
  logFile = root & "\logs\launcher-ui.log"
  If MsgBox("Launcher dừng với lỗi (mã " & rc & ")." & vbCrLf & vbCrLf & _
            "Bấm Yes để mở nhật ký lỗi (logs\launcher-ui.log) và gửi cho kỹ thuật viên.", _
            vbYesNo + vbCritical, "Hương Sen Salon") = vbYes Then sh.Run "notepad.exe """ & logFile & """"
End If

Function HasArg(name)
  Dim j
  HasArg = False
  For j = 0 To WScript.Arguments.Count - 1
    If LCase(WScript.Arguments(j)) = name Then HasArg = True
  Next
End Function
