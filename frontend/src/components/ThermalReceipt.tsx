import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Invoice } from '@/types';
import { formatDateTime, formatVnd } from '@/utils/format';
import { PAYMENT_LABELS, SALON } from '@/utils/constants';
import { useSalonInfo } from '@/utils/salonInfo';
import { VietQrCode } from './VietQrCode';
import { invoiceTransferContent } from '@/utils/vietqr';

/** Nội dung chuyển khoản `SPA <SĐT> <MÃ LỊCH>` (khớp ghi chú đối soát ở màn hình tính tiền). */
export const receiptTransferRef = (inv: Pick<Invoice, 'code' | 'customerPhone' | 'appointmentCode'>) => invoiceTransferContent(inv);

/**
 * Hoá đơn khổ in nhiệt 80 mm (K80) cho máy POS: logo, thông tin tiệm, khách, thợ, dịch vụ, chiết khấu voucher,
 * VietQR (phiếu chưa thu hoặc thu chuyển khoản) và lời cảm ơn. Ẩn trên màn hình; chỉ hiện khi in (CSS `.thermal-receipt`).
 */
export function ThermalReceipt({ invoice }: { invoice: Invoice }) {
  const info = useSalonInfo().info;
  const name = info?.name || SALON.name;
  const address = info?.address || SALON.address;
  const hotline = info?.hotline || SALON.hotline;
  const showQr = invoice.total > 0 && (invoice.status === 'draft' || invoice.paymentMethod === 'transfer');
  return (
    <div className="thermal-receipt" aria-hidden>
      <div className="tr-center">
        <img src="/favicon.svg" alt="" className="tr-logo" />
        <p className="tr-shop">{name}</p>
        <p>{address}</p>
        <p>Hotline: {hotline}</p>
      </div>
      <hr />
      <p className="tr-center tr-title">{invoice.status === 'draft' ? 'PHIẾU TẠM TÍNH' : 'HOÁ ĐƠN THANH TOÁN'}</p>
      <p>Số: <b>{invoice.code}</b> · Lịch: {invoice.appointmentCode}</p>
      <p>Ngày: {formatDateTime(invoice.closedAt ?? invoice.paidAt ?? invoice.createdAt)}</p>
      <p>Khách: {invoice.customerName} · {invoice.customerPhone}</p>
      <p>Thợ làm: {invoice.stylistName}</p>
      <hr />
      <table>
        <thead><tr><th>Dịch vụ</th><th>SL</th><th>T.tiền</th></tr></thead>
        <tbody>
          {invoice.items.map((l) => (
            <tr key={l.id}>
              <td>{l.name}<br /><span className="tr-muted">{l.unitPriceText}</span></td>
              <td>{l.quantity}</td>
              <td>{l.lineTotalText}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <p className="tr-row"><span>Tạm tính</span><span>{invoice.subtotalText}</span></p>
      {invoice.discountAmount > 0 && (
        <p className="tr-row"><span>Giảm giá{invoice.voucherCode ? ` (${invoice.voucherCode})` : ''}</span><span>−{invoice.discountAmountText}</span></p>
      )}
      <p className="tr-row tr-total"><span>TỔNG CỘNG</span><span>{invoice.totalText}</span></p>
      {invoice.paymentMethod && <p className="tr-row"><span>Hình thức</span><span>{PAYMENT_LABELS[invoice.paymentMethod]}</span></p>}
      {showQr && (
        <div className="tr-center tr-qr">
          <p>Quét mã VietQR để thanh toán {formatVnd(invoice.total)}</p>
          <VietQrCode amount={invoice.total} addInfo={receiptTransferRef(invoice)} />
        </div>
      )}
      <hr />
      <p className="tr-center">Cảm ơn quý khách — hẹn gặp lại!</p>
      <p className="tr-center tr-muted">Đặt lịch online: tra cứu bằng mã {invoice.appointmentCode}</p>
    </div>
  );
}

/**
 * In hoá đơn nhiệt: gắn phiếu vào cuối <body> rồi gọi window.print(); chờ QR vẽ xong (bất đồng bộ) trước khi in.
 * Trả về `print(invoice)` và phần tử cần render.
 */
export function useThermalPrint(): { print: (invoice: Invoice) => void; node: JSX.Element | null } {
  const [target, setTarget] = useState<Invoice | null>(null);
  useEffect(() => {
    if (!target) return;
    const done = () => setTarget(null);
    window.addEventListener('afterprint', done);
    const t = window.setTimeout(() => window.print(), 600);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [target]);
  const print = useCallback((invoice: Invoice) => setTarget(invoice), []);
  return { print, node: target ? createPortal(<ThermalReceipt invoice={target} />, document.body) : null };
}
