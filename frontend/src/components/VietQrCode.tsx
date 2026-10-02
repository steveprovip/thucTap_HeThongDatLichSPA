import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BANK, buildVietQrPayload, toBankText } from '@/utils/vietqr';
import { formatVnd } from '@/utils/format';

interface Props {
  amount: number;
  addInfo: string;
  className?: string;
}

/**
 * QR chuyển khoản VietQR. Render SVG (nét sắc ở mọi mật độ điểm ảnh & khi in),
 * ECC mức M, quiet-zone 4 module theo chuẩn ISO/IEC 18004, nền trắng/mã đen cố định.
 * Thư viện `qrcode` được nạp lười để không cộng vào bundle các trang khác.
 */
export function VietQrCode({ amount, addInfo, className = '' }: Props) {
  const payload = buildVietQrPayload({ bankBin: BANK.bin, accountNo: BANK.accountNo, amount, addInfo });
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!payload) return;
    let alive = true;
    setFailed(false);
    import('qrcode')
      .then((QR) => QR.toString(payload, {
        type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#FFFFFF' },
      }))
      .then((svg) => { if (alive) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [payload]);

  if (!payload || failed) {
    return (
      <p className={`flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ${className}`}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        {failed ? 'Không tạo được mã QR. Vui lòng tải lại trang.'
          : 'Chưa cấu hình tài khoản nhận (VITE_BANK_BIN, VITE_BANK_ACCOUNT_NO) nên chưa hiển thị được mã VietQR.'}
      </p>
    );
  }

  return (
    <figure className={`flex flex-col items-center gap-2 text-center ${className}`}>
      <div className="rounded-xl border border-slate-200 bg-white p-1">
        {src
          ? <img src={src} alt="Mã VietQR chuyển khoản" width={220} height={220}
                 className="block h-[220px] w-[220px] max-w-full" draggable={false} />
          : <div className="skeleton-shimmer h-[220px] w-[220px] max-w-full rounded-lg" aria-hidden />}
      </div>
      <figcaption className="text-xs leading-relaxed text-ink-soft">
        {BANK.accountName && <span className="block font-semibold text-slate-900">{BANK.accountName}</span>}
        <span className="block">STK {BANK.accountNo}</span>
        <span className="block">Số tiền <strong className="text-slate-900">{formatVnd(Math.round(amount))}</strong></span>
        <span className="block">Nội dung <strong className="font-mono text-slate-900">{toBankText(addInfo)}</strong></span>
      </figcaption>
    </figure>
  );
}
