@echo off
rem ============================================================================
rem  TẢI AI LOCAL 1 CHẠM — Spark-X2.5-4B (GGUF Q4_K_M ~2,6 GB) + bộ chạy llama.cpp
rem  - Tải bằng cURL, CÓ TẢI TIẾP: mất mạng / tắt máy giữa chừng thì chạy lại tệp này, tải tiếp từ chỗ dừng.
rem  - Kiểm tra SHA-256 sau khi tải (tệp hỏng sẽ bị phát hiện, không chạy nhầm).
rem  - Bộ chạy llama.cpp chọn theo card đồ hoạ: NVIDIA -> CUDA (driver >= 580: CUDA 13.4, cũ hơn: CUDA 12.4),
rem    card khác -> Vulkan, không có card rời -> CPU. Ép chọn: tai_model_local.cmd vulkan | cpu | cuda-12.4 | cuda-13.4
rem  - Máy đã cài Ollama (>= 0.34.1) thì không cần tải bộ chạy: chay_ai_local.cmd tự dùng Ollama.
rem  Model và bộ chạy nằm trong .gitignore — không bao giờ bị đẩy lên GitHub.
rem ============================================================================
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Tai AI local - Spark-X2.5-4B

set "MODEL_REPO=XHToken/Spark-X2.5-4B-GGUF"
set "MODEL_FILE=Spark-X2.5-4B-Q4_K_M.gguf"
set "MODEL_SIZE=2600224352"
set "MODEL_SHA256=adfcfa19a4ed6a5985da8bf565fe15f8e1a7e131d79bae2d19d48d1c40109428"
set "MODEL_URL=https://huggingface.co/%MODEL_REPO%/resolve/main/%MODEL_FILE%?download=true"
set "BACKEND=%~1"

echo ============================================================
echo   TẢI AI LOCAL: Spark-X2.5-4B (Q4_K_M, ~2,6 GB, Apache-2.0)
echo   Nguồn: https://huggingface.co/%MODEL_REPO%
echo   Mất mạng giữa chừng? Chạy lại tệp này để tải tiếp.
echo ============================================================
echo.

where curl >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Không tìm thấy curl. Windows 10 bản 1803 trở lên đã có sẵn curl — hãy cập nhật Windows.
  goto :fail
)

rem ---------------------------------------------------------------- 1. model
set "HAVE="
if exist "%MODEL_FILE%" for %%F in ("%MODEL_FILE%") do set "HAVE=%%~zF"
if "!HAVE!"=="%MODEL_SIZE%" (
  echo [1/3] Đã có model đầy đủ: %MODEL_FILE%
  goto :verify
)
set "PART="
if exist "%MODEL_FILE%.part" for %%F in ("%MODEL_FILE%.part") do set "PART=%%~zF"
if "!PART!"=="%MODEL_SIZE%" goto :finish_part
echo [1/3] Đang tải %MODEL_FILE% (~2,6 GB) ...
call :download "%MODEL_URL%" "%MODEL_FILE%.part"
if errorlevel 1 (
  echo.
  echo [LỖI] Tải chưa xong. Kiểm tra mạng rồi chạy lại tai_model_local.cmd — sẽ tải tiếp phần còn thiếu.
  goto :fail
)
:finish_part
move /y "%MODEL_FILE%.part" "%MODEL_FILE%" >nul

:verify
echo [2/3] Kiểm tra tính toàn vẹn (SHA-256) ...
set "SUM="
for /f "skip=1 delims=" %%H in ('certutil -hashfile "%MODEL_FILE%" SHA256 ^| findstr /v /c:"CertUtil"') do if not defined SUM set "SUM=%%H"
set "SUM=!SUM: =!"
if /i not "!SUM!"=="%MODEL_SHA256%" (
  echo [LỖI] Tệp model bị hỏng ^(SHA-256 không khớp^). Đã xoá để tải lại — chạy lại tai_model_local.cmd.
  del /q "%MODEL_FILE%" >nul 2>nul
  goto :fail
)
echo       OK — model nguyên vẹn.

rem ---------------------------------------------------------------- 2. bộ chạy
set "SERVER="
if exist "runtime" for /r "runtime" %%F in (llama-server.exe) do if exist "%%F" set "SERVER=%%F"
if defined SERVER (
  echo [3/3] Đã có bộ chạy llama.cpp: !SERVER!
  goto :done
)
if not defined BACKEND (
  where ollama >nul 2>nul
  if not errorlevel 1 (
    echo [3/3] Máy đã cài Ollama — chay_ai_local.cmd sẽ dùng Ollama, không cần tải bộ chạy.
    goto :done
  )
  call :pick_backend
)
echo [3/3] Tải bộ chạy llama.cpp bản !BACKEND! cho Windows x64 ...
if not exist "runtime" mkdir "runtime"
call :asset_url "llama-b*-bin-win-!BACKEND!-x64.zip" RT_URL || goto :fail
call :download "!RT_URL!" "runtime\llama.zip" || goto :net_fail
tar -xf "runtime\llama.zip" -C "runtime" || goto :fail
del /q "runtime\llama.zip" >nul 2>nul
if /i "!BACKEND:~0,4!"=="cuda" (
  call :asset_url "cudart-llama-bin-win-!BACKEND!-x64.zip" CU_URL || goto :fail
  call :download "!CU_URL!" "runtime\cudart.zip" || goto :net_fail
  tar -xf "runtime\cudart.zip" -C "runtime" || goto :fail
  del /q "runtime\cudart.zip" >nul 2>nul
)
set "SERVER="
for /r "runtime" %%F in (llama-server.exe) do if exist "%%F" set "SERVER=%%F"
if not defined SERVER (
  echo [LỖI] Giải nén xong nhưng không thấy llama-server.exe trong runtime\.
  goto :fail
)

:done
echo.
echo ============================================================
echo   XONG. Bật AI local: chạy chay_ai_local.cmd (giữ cửa sổ đó mở).
echo   Hệ thống đặt lịch tự nhận AI local tại http://localhost:11434/v1
echo   trong khoảng 10 giây, không cần sửa cấu hình.
echo ============================================================
if not defined SALON_NO_PAUSE pause
exit /b 0

:net_fail
echo [LỖI] Tải bộ chạy chưa xong. Kiểm tra mạng rồi chạy lại tệp này (sẽ tải tiếp).
:fail
echo.
if not defined SALON_NO_PAUSE pause
exit /b 1

rem ---------------------------------------------------------------- tải có TẢI TIẾP (-C -), tự thử lại khi mạng chập chờn
rem (không dùng --retry-all-errors: curl đi kèm Windows 10 đời đầu chưa có cờ này)
:download
set "TRY=0"
:download_again
set /a TRY+=1
curl -L --fail --retry 3 --retry-delay 5 --connect-timeout 20 -C - -o "%~2" "%~1"
if not errorlevel 1 exit /b 0
if !TRY! GEQ 6 exit /b 1
echo       Mạng chập chờn — tải tiếp lần !TRY!/5 sau 5 giây ...
ping -n 6 127.0.0.1 >nul
goto :download_again

rem ---------------------------------------------------------------- chọn bộ chạy theo card đồ hoạ
:pick_backend
set "BACKEND=cpu"
where vulkaninfo >nul 2>nul && set "BACKEND=vulkan"
if exist "%SystemRoot%\System32\vulkan-1.dll" set "BACKEND=vulkan"
where nvidia-smi >nul 2>nul || exit /b 0
set "DRV="
for /f "tokens=1 delims=." %%D in ('nvidia-smi --query-gpu^=driver_version --format^=csv^,noheader 2^>nul') do if not defined DRV set "DRV=%%D"
if not defined DRV exit /b 0
rem CUDA 13 cần driver >= 580 (hỗ trợ cả RTX 20xx/30xx/40xx/50xx); driver cũ hơn dùng CUDA 12.4 (RTX 2050 đời đầu…)
if !DRV! GEQ 580 (set "BACKEND=cuda-13.4") else (set "BACKEND=cuda-12.4")
exit /b 0

rem ---------------------------------------------------------------- tìm link tải bản llama.cpp mới nhất trên GitHub
:asset_url
set "%~2="
for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=20' -Headers @{'User-Agent'='HuongSen-Salon'}; ($r | ForEach-Object { $_.assets } | Where-Object { $_.name -like '%~1' } | Select-Object -First 1).browser_download_url"`) do set "%~2=%%U"
if not defined %~2 (
  echo [LỖI] Không tìm được bản tải "%~1" trên GitHub ^(mạng chặn GitHub hoặc tên bản đã đổi^).
  echo       Tải tay tại https://github.com/ggml-org/llama.cpp/releases rồi giải nén vào thư mục runtime\
  exit /b 1
)
exit /b 0
