import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarX2,
  Clock,
  Hash,
  Lock,
  Phone,
  Scissors,
  Search,
  Star,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { getErrorCode, getErrorDetails, getErrorMessage, publicApi } from "@/api";
import type { AppointmentStatus, PublicAppointment } from "@/types";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Notice,
  Select,
  Spinner,
  StatusBadge,
} from "@/components";
import {
  formatCountdown,
  formatDuration,
  formatWeekdayDate,
  VN_PHONE_MESSAGE,
  VN_PHONE_REGEX,
} from "@/utils/format";
import { SALON } from "@/utils/constants";
import { useToast } from "@/contexts/ToastContext";

/** Khách được tự huỷ khi còn ít nhất 120 phút trước giờ hẹn. */
const CANCEL_CUTOFF_MIN = 120;
/** Mã tra cứu do máy chủ sinh: đúng 8 ký tự chữ/số, không có tiền tố (S2-07). */
const CODE_LENGTH = 8;
const CODE_BODY = /^[A-Z0-9]{8}$/;
/** Máy chủ khoá tra cứu 30 phút sau 10 lần sai/giờ/IP (LOOKUP_LOCKED). Nhớ mốc mở khoá để tải lại trang không mở khoá oan. */
const LOCK_KEY = "salon.lookupLockedUntil";
const LOCK_DEFAULT_SECONDS = 30 * 60;
const readLock = (): number | null => {
  try {
    const until = Number(localStorage.getItem(LOCK_KEY));
    return until > Date.now() ? until : null;
  } catch {
    return null;
  }
};
const writeLock = (until: number | null) => {
  try {
    if (until === null) localStorage.removeItem(LOCK_KEY);
    else localStorage.setItem(LOCK_KEY, String(until));
  } catch {
    /* không có localStorage: vẫn khoá được trong phiên hiện tại */
  }
};

const CANCEL_REASONS = [
  "Bận việc đột xuất",
  "Muốn đổi sang ngày khác",
  "Không khoẻ",
  "Đặt nhầm dịch vụ",
  "Lý do khác",
];

const FLOW: { status: AppointmentStatus; label: string }[] = [
  { status: "pending", label: "Đã đặt" },
  { status: "confirmed", label: "Tiệm xác nhận" },
  { status: "arrived", label: "Đã đến" },
  { status: "in_progress", label: "Đang làm" },
  { status: "completed", label: "Hoàn tất" },
];

/** Chuẩn hoá mã: nhận "k7m2-qp4x" hoặc "K7M2QP4X" → 8 ký tự chữ hoa/số. */
const normalizeBody = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);

const startMs = (a: PublicAppointment) =>
  new Date(`${a.date}T${a.startTime}:00+07:00`).getTime();

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** S2-09 tra cứu lịch bằng mã 8 ký tự hoặc số điện thoại + S3-05 khách tự huỷ. */
export function LookupPage() {
  const [params, setParams] = useSearchParams();
  const initialCode = params.get("code");
  const [mode, setMode] = useState<"code" | "phone">(
    params.get("phone") ? "phone" : "code",
  );
  const [codeBody, setCodeBody] = useState(
    initialCode ? normalizeBody(initialCode) : "",
  );
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState<PublicAppointment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PublicAppointment | null>(
    null,
  );
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [showPast, setShowPast] = useState(false);
  const toast = useToast();
  const now = useNow();

  // QA-02: bị khoá thì vô hiệu hoá tab, ô nhập và nút "Tra cứu" tới đúng lúc mở khoá
  const [lockedUntil, setLockedUntil] = useState<number | null>(readLock);
  const [lockNow, setLockNow] = useState(() => Date.now());
  const isLocked = lockedUntil !== null && lockedUntil > lockNow;
  useEffect(() => {
    if (lockedUntil === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setLockNow(t);
      if (t >= lockedUntil) {
        setLockedUntil(null);
        writeLock(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  /** Lỗi LOOKUP_LOCKED (429): khoá giao diện theo `retryAfterSeconds` của máy chủ. Trả về true nếu đúng lỗi này. */
  const lockFromError = useCallback((e: unknown): boolean => {
    if (getErrorCode(e) !== "LOOKUP_LOCKED") return false;
    const t = Date.now();
    const until = t + (getErrorDetails(e).retryAfterSeconds ?? LOCK_DEFAULT_SECONDS) * 1000;
    setLockNow(t);
    setLockedUntil(until);
    writeLock(until);
    return true;
  }, []);

  const search = useCallback(
    async (payload: { code?: string; phone?: string }) => {
      setLoading(true);
      try {
        const res = await publicApi.lookup(payload);
        setItems([...res].sort((a, b) => startMs(b) - startMs(a)));
      } catch (e) {
        if (lockFromError(e)) {
          setItems(null);
        } else {
          setItems([]);
          toast.error(getErrorMessage(e));
        }
      } finally {
        setLoading(false);
      }
    },
    [toast, lockFromError],
  );

  useEffect(() => {
    if (initialCode && !isLocked && CODE_BODY.test(normalizeBody(initialCode))) {
      void search({ code: normalizeBody(initialCode) });
    }
    // chỉ chạy một lần khi mở trang với tham số code
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError(null);
    if (mode === "code") {
      if (!CODE_BODY.test(codeBody))
        return setError(
          "Mã tra cứu gồm đúng 8 ký tự chữ hoặc số, VD: K7M2QP4X",
        );
      setParams({ code: codeBody });
      void search({ code: codeBody });
    } else {
      if (!VN_PHONE_REGEX.test(phone)) return setError(VN_PHONE_MESSAGE);
      setParams({});
      void search({ phone });
    }
  };

  const cancelInfo = (a: PublicAppointment) => {
    const minutesLeft = Math.floor((startMs(a) - now) / 60_000);
    const cancellableStatus =
      a.status === "pending" || a.status === "confirmed";
    const allowed = cancellableStatus && minutesLeft >= CANCEL_CUTOFF_MIN;
    const deadlineIn = minutesLeft - CANCEL_CUTOFF_MIN;
    return { allowed, cancellableStatus, minutesLeft, deadlineIn };
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    try {
      const updated = await publicApi.cancel(cancelTarget.code, cancelReason);
      toast.success("Đã huỷ lịch hẹn. Khung giờ được trả lại cho khách khác.");
      setItems((list) =>
        (list ?? []).map((a) => (a.code === updated.code ? updated : a)),
      );
    } catch (e) {
      if (!lockFromError(e)) toast.error(getErrorMessage(e));
    }
  };

  const { upcoming, past } = useMemo(() => {
    const list = items ?? [];
    const isPast = (a: PublicAppointment) =>
      ["completed", "cancelled", "no_show"].includes(a.status) ||
      startMs(a) < now - 3 * 3600_000;
    return {
      upcoming: list
        .filter((a) => !isPast(a))
        .sort((a, b) => startMs(a) - startMs(b)),
      past: list.filter(isPast),
    };
  }, [items, now]);

  const shown =
    mode === "code"
      ? (items ?? [])
      : showPast
        ? [...upcoming, ...past]
        : upcoming;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-[2.4rem] font-medium leading-none text-slate-900">
          Tra cứu lịch hẹn
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Nhập mã tra cứu <strong className="text-teal-700">8 ký tự</strong>{" "}
          trong tin nhắn/email xác nhận, hoặc số điện thoại đã dùng khi đặt.
        </p>
      </div>

      <Card className="p-4 sm:p-5">
        {isLocked && lockedUntil !== null && (
          <Notice
            tone="warning"
            icon={<Lock size={16} />}
            title="Tra cứu đang tạm dừng"
            className="mb-3"
          >
            <p>
              Bạn đã thử sai quá 10 lần. Chức năng tra cứu tạm khóa trong 30 phút
              để bảo mật thông tin.
            </p>
            <p className="mt-1">
              Vui lòng thử lại sau{" "}
              <strong className="font-mono tabular-nums">
                {formatCountdown(lockedUntil - lockNow)}
              </strong>{" "}
              (mở lại lúc{" "}
              {new Date(lockedUntil).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              ).
            </p>
          </Notice>
        )}

        <div
          className="mb-3 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1"
          role="tablist"
        >
          {(["code", "phone"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={isLocked}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60
                      ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {m === "code" ? (
                <>
                  <Hash size={14} /> Theo mã
                </>
              ) : (
                <>
                  <Phone size={14} /> Theo số điện thoại
                </>
              )}
            </button>
          ))}
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
        >
          <div className="flex-1">
            {mode === "code" ? (
              <Field
                label="Mã tra cứu"
                htmlFor="lk-code"
                error={error ?? undefined}
              >
                <div
                  className={`flex items-stretch overflow-hidden rounded-xl border focus-within:ring-2 focus-within:ring-teal-500/20
                                 ${isLocked ? "bg-slate-100" : "bg-white"}
                                 ${error ? "border-red-400" : "border-slate-300 focus-within:border-brand-500"}`}
                >
                  <input
                    id="lk-code"
                    value={codeBody}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isLocked}
                    placeholder="K7M2QP4X"
                    onChange={(e) => setCodeBody(normalizeBody(e.target.value))}
                    onPaste={(e) => {
                      e.preventDefault();
                      setCodeBody(
                        normalizeBody(e.clipboardData.getData("text")),
                      );
                    }}
                    className="min-h-[44px] w-full bg-transparent px-3 font-mono text-base uppercase tracking-[0.35em] text-slate-900 placeholder:tracking-[0.35em] placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                    aria-describedby="lk-code-hint"
                  />
                  <span
                    id="lk-code-hint"
                    className="flex items-center pr-3 text-xs text-ink-muted"
                  >
                    {codeBody.length}/{CODE_LENGTH}
                  </span>
                </div>
              </Field>
            ) : (
              <Field
                label="Số điện thoại"
                htmlFor="lk-phone"
                error={error ?? undefined}
              >
                <Input
                  id="lk-phone"
                  value={phone}
                  placeholder="0901234567"
                  inputMode="numeric"
                  disabled={isLocked}
                  invalid={!!error}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                />
              </Field>
            )}
          </div>
          <Button
            type="submit"
            loading={loading}
            disabled={isLocked || loading}
            icon={isLocked ? <Lock size={16} /> : <Search size={16} />}
            className="sm:mt-[26px]"
          >
            {isLocked && lockedUntil !== null
              ? `Tạm khoá · ${formatCountdown(lockedUntil - lockNow)}`
              : "Tra cứu"}
          </Button>
        </form>
      </Card>

      {loading && <Spinner />}

      {!loading && items !== null && items.length === 0 && (
        <Card className="p-8 text-center">
          <CalendarX2 size={30} className="mx-auto text-teal-600" />
          <p className="mt-2 font-semibold">Không tìm thấy lịch hẹn</p>
          <p className="mt-1 text-sm text-ink-muted">
            Kiểm tra lại mã hoặc số điện thoại. Cần hỗ trợ, gọi tiệm{" "}
            {SALON.hotline}.
          </p>
        </Card>
      )}

      {!loading && mode === "phone" && items && items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-ink-muted">
            {upcoming.length} lịch sắp tới · {past.length} lịch đã qua
          </p>
          {past.length > 0 && (
            <button
              className="text-teal-700 hover:underline"
              onClick={() => setShowPast((v) => !v)}
            >
              {showPast ? "Ẩn lịch đã qua" : "Xem cả lịch đã qua"}
            </button>
          )}
        </div>
      )}

      {!loading &&
        shown.map((a) => {
          const info = cancelInfo(a);
          return (
            <Card key={a.code} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 p-4">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    <Ticket size={13} /> Mã{" "}
                    <strong className="font-mono tracking-widest text-teal-700">
                      {a.code}
                    </strong>
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {a.startTime} ·{" "}
                    {formatWeekdayDate(`${a.date}T00:00:00+07:00`)}
                  </p>
                  <p className="text-sm text-ink-soft">
                    Dự kiến xong {a.endTime} ·{" "}
                    {formatDuration(a.totalDurationMinutes)}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>

              <div className="space-y-4 p-4">
                <Timeline status={a.status} />

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <UserRound size={14} className="text-ink-muted" />
                    <dt className="sr-only">Khách</dt>
                    <dd>
                      {a.customerName} · {a.customerPhoneMasked}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Scissors size={14} className="text-ink-muted" />
                    <dt className="sr-only">Thợ</dt>
                    <dd>Thợ {a.stylistName}</dd>
                  </div>
                </dl>

                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                  {a.services.map((s) => (
                    <li
                      key={s.name}
                      className="flex justify-between gap-3 px-3.5 py-2"
                    >
                      <span className="min-w-0 truncate">
                        {s.name}{" "}
                        <span className="text-ink-muted">
                          ({s.durationMinutes}′)
                        </span>
                      </span>
                      <span className="shrink-0 text-ink-soft">
                        {s.priceText}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 px-3.5 py-2 font-semibold">
                    <span>Tạm tính</span>
                    <span className="text-teal-700">
                      {a.estimatedTotalText}
                    </span>
                  </li>
                </ul>

                {a.status === "cancelled" && (
                  <Notice tone="danger">
                    Đã huỷ
                    {a.cancelledByLabel ? ` bởi ${a.cancelledByLabel}` : ""}
                    {a.cancelReason ? ` — ${a.cancelReason}` : ""}
                  </Notice>
                )}

                {info.cancellableStatus &&
                  (info.allowed ? (
                    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock size={13} /> Bạn có thể tự huỷ trong{" "}
                      {formatDuration(info.deadlineIn)} nữa (hạn chót trước giờ
                      hẹn {CANCEL_CUTOFF_MIN} phút).
                    </p>
                  ) : (
                    <Notice tone="warning" icon={<Clock size={15} />}>
                      {info.minutesLeft > 0
                        ? `Còn ${formatDuration(info.minutesLeft)} tới giờ hẹn — đã quá hạn tự huỷ online (trước ${CANCEL_CUTOFF_MIN} phút).`
                        : "Đã tới giờ hẹn."}{" "}
                      Vui lòng gọi tiệm {SALON.hotline} nếu cần thay đổi.
                    </Notice>
                  ))}

                <div className="flex flex-wrap gap-2">
                  {info.cancellableStatus && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<X size={14} />}
                      disabled={!info.allowed || isLocked}
                      title={
                        info.allowed
                          ? "Huỷ lịch hẹn"
                          : `Chỉ huỷ được khi còn ít nhất ${CANCEL_CUTOFF_MIN} phút`
                      }
                      onClick={() => {
                        setCancelReason(CANCEL_REASONS[0]);
                        setCancelTarget(a);
                      }}
                    >
                      Huỷ lịch
                    </Button>
                  )}
                  {a.status === "completed" && (
                    <a
                      className="btn btn-secondary btn-sm"
                      href={`/danh-gia?code=${a.code}`}
                    >
                      <Star size={14} /> Chấm điểm buổi dịch vụ
                    </a>
                  )}
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`tel:${SALON.hotline.replace(/\s/g, "")}`}
                  >
                    <Phone size={14} /> Gọi tiệm
                  </a>
                </div>
              </div>
            </Card>
          );
        })}

      <ConfirmDialog
        open={!!cancelTarget}
        title="Xác nhận huỷ lịch hẹn"
        danger
        confirmLabel="Huỷ lịch"
        cancelLabel="Giữ lịch"
        message={
          <div className="space-y-3">
            <p>
              Huỷ lịch{" "}
              <strong className="font-mono">{cancelTarget?.code}</strong> lúc{" "}
              {cancelTarget?.startTime}{" "}
              {cancelTarget &&
                formatWeekdayDate(`${cancelTarget.date}T00:00:00+07:00`)}
              ?
            </p>
            <Field label="Lý do huỷ">
              <Select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              >
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-ink-muted">
              Khung giờ được trả lại ngay cho khách khác. Thao tác không hoàn
              tác được.
            </p>
          </div>
        }
        onConfirm={doCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}

/** Dòng trạng thái công khai cho khách. */
function Timeline({ status }: { status: AppointmentStatus }) {
  const terminal = status === "cancelled" || status === "no_show";
  const idx = terminal ? 0 : FLOW.findIndex((f) => f.status === status);
  return (
    <ol className="flex items-start" aria-label="Tiến trình lịch hẹn">
      {FLOW.map((f, i) => {
        const done = i <= idx;
        const current = !terminal && i === idx;
        return (
          <li
            key={f.status}
            className="relative flex flex-1 flex-col items-center text-center"
          >
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-2.5 h-0.5 w-full ${i <= idx ? "bg-teal-600" : "bg-slate-200"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 h-5 w-5 rounded-full border-2
              ${current ? "border-teal-600 bg-teal-600 ring-4 ring-teal-600/15" : done ? "border-teal-600 bg-teal-500" : "border-slate-300 bg-white"}`}
            />
            <span
              className={`mt-1 text-[10px] leading-tight sm:text-xs ${done ? "text-ink" : "text-ink-muted"}`}
            >
              {f.label}
            </span>
          </li>
        );
      })}
      {terminal && (
        <li className="relative flex flex-1 flex-col items-center text-center">
          <span
            className="absolute right-1/2 top-2.5 h-0.5 w-full bg-red-300"
            aria-hidden
          />
          <span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
            <X size={11} />
          </span>
          <span className="mt-1 text-[10px] leading-tight text-red-600 sm:text-xs">
            {status === "cancelled" ? "Đã huỷ" : "Không đến"}
          </span>
        </li>
      )}
    </ol>
  );
}
//Dev Frontend – phân hệ Khách//
