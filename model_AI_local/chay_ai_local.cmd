@echo off
rem ============================================================================
rem  BẬT AI LOCAL — máy chủ suy luận tương thích OpenAI API tại http://localhost:11434/v1
rem  Hệ thống đặt lịch (backend) tự dò cổng này mỗi ~10 giây: thấy model đang chạy thì chuyển câu hỏi của Trợ lý AI
rem  sang Spark-X2.5-4B, tắt cửa sổ này thì tự quay về Smart Rule Assistant — không cần sửa .env, không cần khởi động lại.
rem
rem  Ưu tiên bộ chạy llama.cpp trong runtime\ (do tai_model_local.cmd tải); không có thì dùng Ollama nếu máy đã cài.
rem  Tối ưu cho card 4 GB VRAM (RTX 2050): tự vừa bộ nhớ (--fit, chừa 512 MiB), ngữ cảnh 4096, KV cache 8-bit,
rem  Flash Attention, 1 phiên, tắt chế độ "suy nghĩ" để trả lời nhanh. Card lớn hơn: ngữ cảnh 8192, chừa 1 GiB.
rem  Tuỳ chỉnh (đặt trước khi chạy):  set CTX=8192   set GPU_LAYERS=20   set PORT=11434
rem ============================================================================
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title AI local Spark-X2.5-4B - http://localhost:11434/v1

set "MODEL_FILE=Spark-X2.5-4B-Q4_K_M.gguf"
set "ALIAS=spark-x2.5-4b"
if not defined PORT set "PORT=11434"

if not exist "%MODEL_FILE%" (
  echo [LƯU Ý] Chưa có model %MODEL_FILE%. Chạy tai_model_local.cmd trước ^(tải ~2,6 GB, tải tiếp được^).
  goto :fail
)

rem Đã có máy chủ AI chạy ở cổng này (cửa sổ khác / Ollama nền) thì thôi
curl -s -m 2 -o nul -w "%%{http_code}" "http://127.0.0.1:%PORT%/v1/models" > "%TEMP%\salon_ai_port.txt" 2>nul
set "CODE="
set /p CODE=<"%TEMP%\salon_ai_port.txt"
del /q "%TEMP%\salon_ai_port.txt" >nul 2>nul
if "!CODE!"=="200" (
  echo [OK] Máy chủ AI local đã chạy sẵn tại http://localhost:%PORT%/v1 — Trợ lý AI đang dùng nó.
  goto :end
)

rem ---- cấu hình theo VRAM của card NVIDIA (không có card NVIDIA: coi như máy nhỏ)
set "VRAM=0"
where nvidia-smi >nul 2>nul && for /f "tokens=1" %%M in ('nvidia-smi --query-gpu^=memory.total --format^=csv^,noheader^,nounits 2^>nul') do if !VRAM! EQU 0 set "VRAM=%%M"
if !VRAM! GTR 0 if !VRAM! LEQ 4700 (set "PROFILE=4GB") else (set "PROFILE=large")
if !VRAM! EQU 0 set "PROFILE=4GB"
if "!PROFILE!"=="4GB" (
  if not defined CTX set "CTX=4096"
  set "FIT=512"
) else (
  if not defined CTX set "CTX=8192"
  set "FIT=1024"
)

set "SERVER="
if exist "runtime" for /r "runtime" %%F in (llama-server.exe) do if exist "%%F" set "SERVER=%%F"
if defined SERVER goto :llama
where ollama >nul 2>nul
if not errorlevel 1 goto :ollama
echo [LƯU Ý] Chưa có bộ chạy AI. Chạy tai_model_local.cmd ^(tự tải llama.cpp hợp card đồ hoạ^) hoặc cài Ollama ^>= 0.34.1.
goto :fail

:llama
set "GPU_ARGS=--fit on -fitt !FIT!"
if defined GPU_LAYERS set "GPU_ARGS=-ngl %GPU_LAYERS%"
echo ============================================================
echo   AI LOCAL: Spark-X2.5-4B qua llama.cpp
echo   API      : http://localhost:%PORT%/v1   (model "%ALIAS%")
echo   Cấu hình : VRAM !VRAM! MB ^| ngữ cảnh !CTX! ^| !GPU_ARGS!
echo   GIỮ CỬA SỔ NÀY MỞ. Đóng cửa sổ = tắt AI local (Trợ lý tự quay về chế độ luật).
echo ============================================================
"!SERVER!" -m "%MODEL_FILE%" --host 127.0.0.1 --port %PORT% -a %ALIAS% -c !CTX! -fa on -ctk q8_0 -ctv q8_0 -np 1 -rea off !GPU_ARGS!
echo.
echo [LƯU Ý] Máy chủ AI đã dừng (mã %ERRORLEVEL%). Nếu báo thiếu bộ nhớ GPU: set GPU_LAYERS=20 rồi chạy lại;
echo     nếu card không hợp bản CUDA: xoá thư mục runtime rồi chạy "tai_model_local.cmd vulkan".
goto :fail

:ollama
echo ============================================================
echo   AI LOCAL: Spark-X2.5-4B qua Ollama (cần Ollama ^>= 0.34.1)
echo ============================================================
rem Nạp đúng tệp GGUF đã tải vào Ollama (không tải lại 2,6 GB)
if not exist "Modelfile" (
  > "Modelfile" echo FROM ./%MODEL_FILE%
  >> "Modelfile" echo PARAMETER num_ctx !CTX!
  >> "Modelfile" echo PARAMETER temperature 0.4
)
curl -s -m 2 -o nul "http://127.0.0.1:11434/api/version" || (
  echo Khởi động Ollama nền ...
  start "Ollama" /min ollama serve
  ping -n 6 127.0.0.1 >nul
)
ollama show %ALIAS% >nul 2>nul || ollama create %ALIAS% -f Modelfile || goto :fail
echo [OK] Model "%ALIAS%" đã sẵn sàng trong Ollama tại http://localhost:11434/v1
echo      Hệ thống đặt lịch tự nhận trong khoảng 10 giây. Đang nạp model lên card đồ hoạ ...
ollama run %ALIAS% "Xin chào" >nul 2>nul
echo [OK] Xong. Ollama chạy nền — có thể đóng cửa sổ này.
goto :end

:fail
echo.
if not defined SALON_NO_PAUSE pause
exit /b 1

:end
if not defined SALON_NO_PAUSE pause
exit /b 0
