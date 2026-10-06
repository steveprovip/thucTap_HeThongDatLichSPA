@echo off
title [1-CLICK] AI Autonomous Exploration & Tao Bao Cao Word (.docx)
color 0B
cls
echo ==============================================================================
echo        SALON-SPA BOOKING - AI AUTONOMOUS EXPLORATION & WORD REPORT
echo ==============================================================================
echo.
echo [*] BƯỚC 1: AI Agent đang tự động dạo quanh 24+ trang và tìm bug...
echo.

cd /d "F:\hoc_tap\thuc_tap\du_an"
call node scripts/ai_autonomous_explorer.mjs

echo.
echo [*] BƯỚC 2: Đang tự động xuất file Báo Cáo Word (.docx) kèm ảnh minh họa...
echo.
call python scripts/generate_word_report.py

echo.
echo ==============================================================================
echo [HOÀN TẤT] File Báo Cáo Word đã được tạo thành công tại:
echo F:\hoc_tap\thuc_tap\du_an\Bao_Cao_Kiem_Thu_Tu_Dong_AI_Salon_Spa.docx
echo ==============================================================================
echo.
pause
