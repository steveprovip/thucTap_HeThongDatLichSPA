import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Star } from 'lucide-react';
import { getErrorMessage, reviewsApi } from '@/api';
import type { ReviewForm } from '@/types';
import { Button, Card, Spinner, StarRating, Textarea } from '@/components';
import { useToast } from '@/contexts/ToastContext';

/** S4-04: biểu mẫu đánh giá 1-5 sao, liên kết dùng một lần trong 7 ngày. */
export function ReviewPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const code = params.get('code');

  const [form, setForm] = useState<ReviewForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    const loader = token ? reviewsApi.byToken(token) : code ? reviewsApi.byCode(code) : null;
    if (!loader) {
      setError('Thiếu mã lịch hẹn hoặc liên kết đánh giá');
      setLoading(false);
      return;
    }
    loader
      .then((f) => {
        if (!alive) return;
        setForm(f);
        setRating(f.rating ?? 0);
        setComment(f.comment ?? '');
      })
      .catch((e) => { if (alive) setError(getErrorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token, code]);

  const submit = async () => {
    if (!form) return;
    if (rating < 1) return toast.warning('Vui lòng chọn số sao trước khi gửi');
    setSubmitting(true);
    try {
      const updated = await reviewsApi.submit(form.token, rating, comment.trim() || undefined);
      setForm(updated);
      toast.success('Cảm ơn bạn đã chấm điểm!');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Đang mở biểu mẫu đánh giá…" />;

  if (error || !form) {
    return (
      <Card className="p-8 text-center">
        <Star size={30} className="mx-auto text-brand-400" />
        <p className="mt-2 font-semibold">Không mở được biểu mẫu đánh giá</p>
        <p className="mt-1 text-sm text-ink-muted">{error}</p>
      </Card>
    );
  }

  if (form.alreadySubmitted) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 size={34} className="mx-auto text-green-600" />
        <p className="mt-2 text-lg font-bold">Bạn đã gửi đánh giá cho buổi này</p>
        <div className="mt-3 flex justify-center"><StarRating value={form.rating ?? 0} readOnly /></div>
        {form.comment && <p className="mt-3 text-sm italic text-ink-soft">“{form.comment}”</p>}
        <p className="mt-4 text-xs text-ink-muted">Mỗi liên kết đánh giá chỉ dùng được một lần.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <h1 className="text-xl font-bold">Bạn thấy buổi dịch vụ thế nào?</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Lịch <strong className="tracking-widest">{form.appointmentCode}</strong> ngày {form.dateText} — thợ{' '}
        <strong>{form.stylistName}</strong>
      </p>
      <p className="mt-1 text-sm text-ink-muted">{form.serviceNames.join(' · ')}</p>

      <div className="mt-5">
        <p className="field-label">Chấm điểm cho thợ</p>
        <StarRating value={rating} onChange={setRating} />
        <p className="mt-1 text-xs text-ink-muted">
          {rating === 0 ? 'Chạm vào ngôi sao để chấm điểm' : `${rating}/5 sao`}
        </p>
      </div>

      <div className="mt-4">
        <label className="field-label" htmlFor="rv-comment">Nhận xét (không bắt buộc)</label>
        <Textarea
          id="rv-comment"
          value={comment}
          maxLength={500}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Điều gì khiến bạn hài lòng hoặc chưa hài lòng?"
        />
        <p className="mt-1 text-xs text-ink-muted">{comment.length}/500 ký tự</p>
      </div>

      <Button className="mt-5 w-full sm:w-auto" loading={submitting} onClick={submit}>
        Gửi đánh giá
      </Button>
    </Card>
  );
}
