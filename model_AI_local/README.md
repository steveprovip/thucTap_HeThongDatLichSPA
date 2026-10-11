# AI local — Spark-X2.5-4B cho Trợ lý AI của Salon & Spa Hương Sen

Thư mục này giúp **bật AI chạy ngay trên máy tiệm** (không gửi dữ liệu ra Internet) cho cả hai trợ lý:
Trợ lý vận hành (chủ tiệm, lễ tân) và Trợ lý tư vấn sắc đẹp (khách trên trang đặt lịch).

> Không bật AI local hệ thống vẫn chạy bình thường: trợ lý trả lời bằng **Smart Rule Assistant** (luật + số liệu thật
> của tiệm). Bật lên là backend **tự phát hiện** trong khoảng 10 giây và chuyển câu hỏi sang mô hình — không cần sửa
> `.env`, không cần khởi động lại.

## Bật AI local (2 bước)

| Bước | Việc làm | Ghi chú |
| --- | --- | --- |
| 1 | Nhấp đúp **`tai_model_local.cmd`** | Tải `Spark-X2.5-4B-Q4_K_M.gguf` (~2,6 GB) từ [HuggingFace](https://huggingface.co/XHToken/Spark-X2.5-4B-GGUF), kiểm tra SHA-256, rồi tải bộ chạy [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) hợp card đồ hoạ. Mất mạng giữa chừng: chạy lại, **tải tiếp** từ chỗ dừng. |
| 2 | Nhấp đúp **`chay_ai_local.cmd`** và **giữ cửa sổ mở** | Máy chủ tương thích OpenAI tại `http://localhost:11434/v1`, model `spark-x2.5-4b`. Đóng cửa sổ = tắt AI, trợ lý tự quay về chế độ luật. |

Kiểm tra: mở Trợ lý AI trong trang quản lý — dòng trạng thái dưới tiêu đề đổi từ **“Trợ lý thông minh”** sang
**“AI local · spark-x2.5-4b”**.

## Phần cứng

- **Tối ưu cho RTX 2050 4 GB VRAM**: `chay_ai_local.cmd` tự đọc VRAM; card ≤ 4,7 GB dùng ngữ cảnh 4096, KV cache 8-bit,
  Flash Attention, 1 phiên, `--fit` chừa 512 MiB để Windows không tràn bộ nhớ chia sẻ; tắt chế độ “suy nghĩ” (`-rea off`)
  nên câu trả lời đến sau vài giây. Card lớn hơn tự dùng ngữ cảnh 8192.
- Bộ chạy tự chọn: NVIDIA → CUDA (driver ≥ 580: CUDA 13.4, cũ hơn: CUDA 12.4); card khác → Vulkan; không có card rời → CPU
  (chậm, ~15–30 giây/câu — trợ lý tự quay về luật nếu quá `AI_TIMEOUT_MS`, mặc định 25 giây).
- Ép bộ chạy: `tai_model_local.cmd vulkan` (hoặc `cpu`, `cuda-12.4`, `cuda-13.4`) sau khi xoá thư mục `runtime\`.
- Thiếu bộ nhớ GPU: `set GPU_LAYERS=20` rồi chạy lại `chay_ai_local.cmd` (đẩy bớt lớp sang CPU).
- Đã cài **Ollama ≥ 0.34.1**: bỏ qua bộ chạy llama.cpp, `chay_ai_local.cmd` nạp đúng tệp GGUF đã tải vào Ollama (cùng cổng 11434).

## Vì sao đẩy lên GitHub an toàn

`.gitignore` của thư mục này chặn `*.gguf`, `*.bin`, `*.tar.gz`, `*.zip`, `*.part` và thư mục `runtime/` — chỉ 4 tệp
script / hướng dẫn (vài KB) nằm trong kho mã. GitHub giới hạn 100 MB/tệp; model 2,6 GB không bao giờ bị commit nhầm.
Người clone dự án về chỉ cần làm lại 2 bước trên.

## Cấu hình backend (tuỳ chọn, `backend/.env`)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `AI_PROVIDER` | *(trống = `auto`)* | `auto`: tự dò AI local; `off`: luôn trả lời theo luật; `ollama` / `openai`: cấu hình cố định như trước |
| `AI_BASE_URL` | `http://127.0.0.1:11434/v1` | Địa chỉ máy chủ AI local được dò |
| `AI_MODEL` | *(trống)* | Trống: dùng model máy chủ đang nạp (ưu tiên tên có “spark”) |
| `AI_TIMEOUT_MS` | `25000` | Quá thời gian thì trả lời theo luật cho câu đó, 10 giây sau mới thử lại mô hình |

Giấy phép model: Apache-2.0 (XHToken/Spark-X2.5-4B).
