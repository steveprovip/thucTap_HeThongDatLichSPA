import { Volume2, VolumeX } from 'lucide-react';
import { setSoundMuted, useSoundMuted } from '@/utils/sound';

/** Bật / tắt âm phản hồi (chọn giờ, chốt lịch, chuông lịch mới). Lựa chọn được nhớ trên máy. */
export function SoundToggle({ className = '' }: { className?: string }) {
  const muted = useSoundMuted();
  return (
    <button type="button" onClick={() => setSoundMuted(!muted)} aria-pressed={!muted}
            aria-label={muted ? 'Bật âm phản hồi' : 'Tắt âm phản hồi'} title={muted ? 'Bật âm phản hồi' : 'Tắt âm phản hồi'}
            className={`tap-44 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-[color,background-color,transform] duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 active:scale-[0.94] ${className}`}>
      {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
    </button>
  );
}
