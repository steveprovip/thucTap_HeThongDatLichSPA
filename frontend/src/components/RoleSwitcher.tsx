import { useNavigate } from 'react-router-dom';
import { UsersRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Role } from '@/types';
import { DEMO_MODE } from '@/api/mockBackend';

const roles: { id: Role; label: string; route: string }[] = [
  { id: 'customer', label: 'Khách', route: '/' },
  { id: 'receptionist', label: 'Lễ tân', route: '/quan-ly' },
  { id: 'stylist', label: 'Thợ', route: '/quan-ly/lich-cua-toi' },
  { id: 'owner', label: 'Chủ tiệm', route: '/quan-ly/tong-quan' },
  { id: 'admin', label: 'Quản trị', route: '/quan-ly/tai-khoan' },
];

export function RoleSwitcher() {
  const { user, setDemoRole } = useAuth();
  const navigate = useNavigate();
  if (!DEMO_MODE) return null;
  const current = user?.role ?? 'customer';
  return (
    <div className="role-switcher no-print fixed bottom-[132px] right-3 z-[80] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-slate-200 bg-white/90 py-1.5 pl-3.5 pr-1.5 text-slate-800 shadow-lg backdrop-blur-md sm:bottom-5 sm:right-5 lg:bottom-auto lg:right-auto lg:left-1/2 lg:top-1.5 lg:-translate-x-1/2">
      <UsersRound size={17} className="hidden shrink-0 text-teal-600 sm:block" aria-hidden="true" />
      <label htmlFor="demo-role" className="whitespace-nowrap text-xs font-semibold text-slate-600">Xem vai trò</label>
      <select id="demo-role" value={current} onChange={event => {
        const next = roles.find(role => role.id === event.target.value);
        if (!next) return;
        setDemoRole(next.id); navigate(next.route);
      }} className="min-h-9 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40">
        {roles.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
      </select>
    </div>
  );
}
