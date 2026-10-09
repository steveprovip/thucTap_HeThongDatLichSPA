"""Verify a dated release dossier against its topic, code inputs and artifacts.

Standard library only. Run from any directory: python scripts/release_evidence.py.
This verifies recorded evidence integrity, not production acceptance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inside(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"Path escapes repository: {relative}")
    return path


def snapshot(root: Path, folders: list[str]) -> list[dict[str, str]]:
    ignored = {'node_modules', '.venv', 'venv', '.runtime', '__pycache__', '.pytest_cache',
               '.next', 'dist', 'coverage', 'logs', 'backups', '.git'}
    files = set()
    for folder in folders:
        base = inside(root, folder)
        if base.is_file():
            files.add(base)
        elif base.is_dir():
            for directory, dirs, names in os.walk(base):
                dirs[:] = [name for name in dirs if name not in ignored]
                for name in names:
                    if name == '.env' or name.endswith(('.pyc', '.log', '.dump')):
                        continue
                    path = Path(directory) / name
                    if not path.is_symlink():
                        files.add(inside(root, path.relative_to(root).as_posix()))
    return [dict(path=p.relative_to(root).as_posix(), sha256=sha256(p)) for p in sorted(files)]


def render(data: dict) -> str:
    lines = [f"# {data['title']}", "", f"Ngày kiểm định: {data['date']} (Asia/Saigon)", "",
             f"**Trạng thái: {data['readiness']}**", "", data['scope'], "",
             "## Đề tài và phạm vi", ""]
    lines.extend(f"- `{item['path']}`: {item['description']}" for item in data['assignment_sources'])
    lines.extend(["", "## Thay đổi đã thực hiện", ""])
    for fix in data['fixes']:
        lines.extend([f"### {fix['id']} {fix['title']}", "", fix['detail'], ""])
    lines.extend(["## Kiểm chứng ghi nhận", "", "Kết quả là ảnh chụp của lần chạy có ngày và lệnh bên dưới. Kiểm tra checksum không chạy lại các bài test.", ""])
    for check in data['checks']:
        lines.extend([f"- **{check['status']}** `{check['command']}`: {check['result']}"])
    lines.extend(["", "## Điều kiện còn thiếu trước khi giao khách", ""])
    lines.extend(f"- {item}" for item in data['remaining'])
    lines.extend(["", "## Thay đổi so với nghiệp vụ đề tài", ""])
    lines.extend(f"- {item}" for item in data['domain_changes'])
    lines.extend(["", "## Hướng phát triển đề xuất", ""])
    for item in data['directions']:
        lines.extend([f"### {item['title']}", "", item['detail'], ""])
    lines.extend(["## Đối chiếu yêu cầu", "", "Ánh xạ đến mã nguồn không đồng nghĩa tất cả tiêu chí nghiệm thu đã được kiểm thử.", ""])
    for requirement in data['requirements']:
        lines.extend([f"- **{requirement['id']}** {requirement['title']}. Nguồn: {requirement['source']}. Bằng chứng: {requirement['evidence']}. Trạng thái: {requirement['status']}."])
    lines.extend(["", "## Nguồn nghiên cứu", ""])
    lines.extend(f"- [{item['title']}]({item['url']}): {item['application']}" for item in data['research'])
    lines.extend(["", "## Quản lý phiên bản tài liệu", "", "`release.json` là dữ liệu gốc của hồ sơ phát hành này. `STATUS.md` và slide phát hành được tạo từ dữ liệu đó. Tài liệu học phần cũ là bằng chứng lịch sử, không phải xác nhận vận hành bản hiện tại.", "",
                  "Chạy `python scripts/release_evidence.py` sau khi sửa mã hoặc tài liệu. Khi checksum thay đổi, chạy lại kiểm thử liên quan, cập nhật dữ liệu và tạo lại cả báo cáo lẫn slide. Không cập nhật checksum đơn thuần để hợp thức hóa kết quả cũ.", ""])
    return "\n".join(lines)


def validate(root: Path, manifest: Path) -> list[str]:
    errors: list[str] = []
    try:
        data = json.loads(manifest.read_text(encoding='utf-8'))
        for key in ['title', 'date', 'readiness', 'scope', 'assignment_sources', 'fixes', 'checks',
                    'remaining', 'domain_changes', 'directions', 'requirements', 'research', 'inputs']:
            if key not in data:
                errors.append(f"Missing required field: {key}")
        if errors:
            return errors
        identifiers = [item['id'] for item in data['requirements']]
        if len(identifiers) != len(set(identifiers)):
            errors.append('Duplicate requirement ID')
        allowed = {'PASS', 'FAIL', 'BLOCKED', 'NOT_RUN', 'WARN'}
        for check in data['checks']:
            if check['status'] not in allowed:
                errors.append(f"Invalid check status: {check['status']}")
        if data['readiness'] == 'PRODUCTION_READY' and (data['remaining'] or any(
                item['status'] != 'PASS' for item in data['checks'])):
            errors.append('Readiness conflicts with remaining gates or recorded checks')
        for item in data['assignment_sources'] + data['inputs']:
            try:
                path = inside(root, item['path'])
                if not path.is_file():
                    errors.append(f"Missing input: {item['path']}")
                elif sha256(path) != item['sha256']:
                    errors.append(f"Stale evidence: {item['path']}")
            except (KeyError, ValueError) as exc:
                errors.append(str(exc))
        if 'snapshot_roots' in data and snapshot(root, data['snapshot_roots']) != data['inputs']:
            errors.append('Source file set changed since evidence was captured')
        report = manifest.parent / 'STATUS.md'
        if not report.is_file() or report.read_text(encoding='utf-8') != render(data):
            errors.append('STATUS.md differs from release.json; regenerate after revalidation')
        artifacts = manifest.parent / 'artifacts.json'
        if not artifacts.is_file():
            errors.append('Missing artifacts.json')
        else:
            index = json.loads(artifacts.read_text(encoding='utf-8'))
            if index.get('manifest_sha256') != sha256(manifest):
                errors.append('Artifacts were generated from a different release.json')
            for item in index.get('files', []):
                path = inside(root, item['path'])
                if not path.is_file() or sha256(path) != item['sha256']:
                    errors.append(f"Missing or modified artifact: {item['path']}")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f'Invalid release dossier: {exc}')
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--write-status', action='store_true', help='Regenerate Markdown only; does not accept stale tests')
    args = parser.parse_args()
    root = args.root.resolve()
    manifest = root / 'docs/release/release.json'
    if args.write_status:
        data = json.loads(manifest.read_text(encoding='utf-8'))
        (manifest.parent / 'STATUS.md').write_text(render(data), encoding='utf-8', newline='\n')
        return 0
    errors = validate(root, manifest)
    for error in errors:
        print(f'FAIL: {error}', file=sys.stderr)
    if not errors:
        print('PASS: topic/code checksums and generated dossier are consistent. Runtime acceptance remains separate.')
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
