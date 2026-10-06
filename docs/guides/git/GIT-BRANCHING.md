# Quy trình nhánh Git

Áp dụng từ v1.4.0 theo góp ý Mentor Sprint 2 (06/10/2026, mục 1: “Phân chia lại các nhánh trong GitHub cho hợp lý”).

## 1. Các nhánh

| Nhánh | Vai trò | Ai được đẩy | Tự động |
|---|---|---|---|
| `main` | **Production** — bản đang chạy ở tiệm, mỗi lần hợp nhất được gắn thẻ `vX.Y.Z` | Chỉ hợp nhất từ `develop` (hoặc `hotfix/*`) qua Pull Request | Render tự deploy khi CI xanh; Launcher ở tiệm thấy nút **CẬP NHẬT** |
| `develop` | **Staging** — tích hợp các tính năng đã xong của Sprint | Chỉ hợp nhất từ `feature/*`, `fix/*`, `docs/*` qua Pull Request | CI chạy đủ lint · typecheck · unit · e2e · build |
| `feature/<mô-tả>` | Tính năng mới, tách từ `develop` | Người làm tính năng | CI khi mở Pull Request |
| `fix/<mô-tả>` | Sửa lỗi QA / lỗi thường, tách từ `develop` | Người sửa | CI khi mở Pull Request |
| `docs/<mô-tả>` | Tài liệu, báo cáo, slide | Người viết | CI khi mở Pull Request |
| `hotfix/<phiên-bản>` | Sửa gấp trên Production, tách từ `main`, hợp nhất về **cả** `main` và `develop` | Trưởng nhóm | — |

Tên nhánh viết thường, nối bằng dấu gạch: `feature/slot-hold`, `fix/qa-round6-1010`, `docs/report-v1.4.0`.

```
main     ●──────────────────────────────●  v1.3.6 ───────────────●  v1.4.0
          \                            /                         /
develop    ●──●───────●────────●──────●──●──────●──────●────────●
               \     /  \     /           \    /  \    /
feature/*       ●───●    ●───●             ●──●    ●──●   (mỗi nhánh = một hạng mục, xoá sau khi hợp nhất)
```

## 2. Vòng đời một hạng mục

```bash
git checkout develop && git pull origin develop
git checkout -b feature/ai-holiday-generator
# ... code + test ...
git commit -m "feat(holidays): AI assistant generates all Vietnamese public holidays"
git push -u origin feature/ai-holiday-generator      # mở Pull Request vào develop
# Sau khi review + CI xanh: "Create a merge commit" (giữ lịch sử từng hạng mục), xoá nhánh feature
```

Phát hành: Pull Request `develop → main`, hợp nhất bằng merge commit, gắn thẻ và đẩy thẻ:

```bash
git checkout main && git pull && git merge --no-ff develop -m "release: v1.4.0"
git tag -a v1.4.0 -m "release: v1.4.0 - ..." && git push origin main --tags
```

## 3. Commit message — Conventional Commits

`<loại>(<phạm vi>): <mô tả ngắn, thể mệnh lệnh>` với loại: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`.
Mỗi commit một hạng mục, thân commit giải thích **vì sao** và các quyết định quan trọng.

## 4. Bảo vệ nhánh trên GitHub (Settings → Branches)

- `main`, `develop`: bắt buộc Pull Request, bắt buộc CI “CI - Kiem Tra Chat Luong Ma Nguon” xanh, cấm force-push, cấm xoá.
- `main`: chỉ Code Owner (`.github/CODEOWNERS`) được duyệt.

## 5. Dọn nhánh cũ

Các nhánh cũ (`feat/*`, `fix/qa-round*`, `release/v1.3.0`, `hotfix/v1.2.6`…) được **lưu trữ thành thẻ** `archive/<tên-nhánh>` rồi xoá,
nên lịch sử không mất và khôi phục được bất cứ lúc nào:

```bash
node scripts/git/branch-cleanup.mjs            # xem trước
node scripts/git/branch-cleanup.mjs --apply    # thực hiện
git checkout -b fix/qa-audit-23 archive/fix/qa-audit-23   # khôi phục một nhánh nếu cần
```

Cấu hình Git cho thành viên mới: `scripts/git/setup_git_workflow.bat` (Windows) hoặc `scripts/git/setup_git_workflow.sh`.
