import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; resetKey?: string }
interface State { error: Error | null }

const RELOAD_FLAG = 'salon.chunkReload';
/** Sau khi deploy bản mới, chunk cũ (hash cũ) không còn trên server → import() lỗi. */
const isChunkError = (e: Error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i
    .test(e.message);

/**
 * Chặn lỗi render ở cấp trang để một màn hỏng không làm trắng cả ứng dụng.
 * resetKey (pathname) đổi → tự gỡ lỗi khi người dùng chuyển trang.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkError(error)) {
      try {
        // Tự tải lại tối đa 1 lần / 10 giây → không lặp vô hạn nếu server thật sự lỗi
        if (Date.now() - Number(sessionStorage.getItem(RELOAD_FLAG) || 0) > 10_000) {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
          window.location.reload();
          return;
        }
      } catch { /* storage bị chặn: hiển thị màn lỗi */ }
    }
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 px-5 py-8 text-center">
        <p className="font-semibold text-red-700">Trang gặp sự cố khi hiển thị</p>
        <p className="mt-1 text-sm text-red-600">Vui lòng tải lại. Nếu lỗi lặp lại, báo quản trị viên.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>Tải lại trang</button>
      </div>
    );
  }
}
