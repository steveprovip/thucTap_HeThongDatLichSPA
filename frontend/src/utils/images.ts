/**
 * Thư viện ảnh HD cho dịch vụ & chuyên viên.
 * Mỗi dịch vụ / thợ có ảnh riêng — không dùng chung một ảnh cho cả danh mục.
 */
const u = (id: string, w = 800, q = 80) => `https://images.unsplash.com/photo-${id}?w=${w}&q=${q}&auto=format&fit=crop`;

export const IMAGES = {
  hair_cut_men: u('1503951914875-452162b0f3f1'),
  hair_cut_women: u('1560066984-138dadb4c035'),
  hair_dye_balayage: u('1522337360788-8b13dee7a37e'),
  hair_perm_curly: u('1580618672591-eb180b1a973f'),
  hair_treatment: u('1527799820374-dcf8d9d4a388'),
  spa_head_wash: u('1540555700478-4be289fbecef'),
  spa_massage_neck: u('1519823551278-64ac92734fb1'),
  skin_facial_care: u('1570172619644-dfd03ed5d881'),
  skin_acne_treatment: u('1512290900672-1f5be661f061'),
  nail_art_spa: u('1632345031435-8727f6897d53'),
  combo_vip: u('1562322140-8baeececf3df'),
  // Bổ sung để 12 dịch vụ mẫu đều có ảnh riêng.
  spa_relax_wash: u('1600334089648-b0d9d3028eb2'),
  spa_face_massage: u('1515377905703-c4788e51af15'),
  spa_couple: u('1544161515-4ab6ce6db874'),
  hero_spa_interior: u('1629909613654-28e377c37b09', 1200, 85),
} as const;

export type ImageKey = keyof typeof IMAGES;

export const STYLIST_PHOTOS = {
  stylist_1: u('1534528741775-53994a69daeb', 400),
  stylist_2: u('1507003211169-0a1dd7228f2d', 400),
  stylist_3: u('1517841905240-472988babdf9', 400),
  stylist_4: u('1500648767791-00dcc994a43e', 400),
  stylist_5: u('1494790108377-be9c29b29330', 400),
} as const;

/** Ảnh cố định cho thợ mẫu (khớp giới tính theo tên). */
const STYLIST_BY_ID: Record<string, string> = {
  st1: STYLIST_PHOTOS.stylist_1, // Nguyễn Minh Anh
  st2: STYLIST_PHOTOS.stylist_5, // Trần Bảo Ngọc
  st3: STYLIST_PHOTOS.stylist_2, // Lê Hoàng Phúc
  st4: STYLIST_PHOTOS.stylist_3, // Phạm Thanh Hà
};
const STYLIST_POOL = Object.values(STYLIST_PHOTOS);

/** Ảnh chuẩn theo mã dịch vụ mẫu. */
const SERVICE_BY_ID: Record<string, ImageKey> = {
  s1: 'hair_cut_women', s2: 'hair_dye_balayage', s3: 'hair_perm_curly',
  s4: 'spa_head_wash', s5: 'spa_relax_wash', s6: 'hair_treatment',
  s7: 'skin_facial_care', s8: 'skin_acne_treatment', s9: 'spa_face_massage',
  s10: 'combo_vip', s11: 'spa_massage_neck', s12: 'spa_couple',
};

/** Luật theo từ khoá (tên đã bỏ dấu) cho dịch vụ do tiệm tự thêm. */
const KEYWORD_RULES: [RegExp, ImageKey][] = [
  [/\b(nail|mong|gel|son mong)\b/, 'nail_art_spa'],
  [/(toc nam|barber|fade|undercut)/, 'hair_cut_men'],
  [/(nhuom|balayage|highlight|mau toc)/, 'hair_dye_balayage'],
  [/(uon|song|xoan|perm)/, 'hair_perm_curly'],
  [/(phuc hoi|keratin|u toc|hap dau|nano)/, 'hair_treatment'],
  [/(cat|tao kieu|layer)/, 'hair_cut_women'],
  [/(mun|nan|lam sach sau|thai doc)/, 'skin_acne_treatment'],
  [/(massage mat|nang co)/, 'spa_face_massage'],
  [/(da|facial|mat na|cap am)/, 'skin_facial_care'],
  [/(cap doi|couple|hai nguoi)/, 'spa_couple'],
  [/(vai gay|massage|tinh dau|aroma)/, 'spa_massage_neck'],
  [/(goi duong sinh|thao moc|goi dau)/, 'spa_head_wash'],
  [/(goi|thu gian)/, 'spa_relax_wash'],
  [/(combo|vip|tron goi|mot ngay)/, 'combo_vip'],
];

const CATEGORY_POOL: Record<string, ImageKey[]> = {
  hair: ['hair_cut_women', 'hair_dye_balayage', 'hair_perm_curly', 'hair_treatment', 'hair_cut_men'],
  wash: ['spa_head_wash', 'spa_relax_wash', 'spa_massage_neck', 'hair_treatment'],
  skin: ['skin_facial_care', 'skin_acne_treatment', 'spa_face_massage'],
  combo: ['combo_vip', 'spa_massage_neck', 'spa_couple'],
};

const SERVICE_KEYS = (Object.keys(IMAGES) as ImageKey[]).filter((k) => k !== 'hero_spa_interior');

export const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

function preferredKey(service: { id: string; name: string; categoryId?: string }): ImageKey | undefined {
  if (SERVICE_BY_ID[service.id]) return SERVICE_BY_ID[service.id];
  const name = stripAccents(service.name);
  return KEYWORD_RULES.find(([re]) => re.test(name))?.[1];
}

/**
 * Gán ảnh cho cả danh sách dịch vụ, bảo đảm KHÔNG trùng ảnh trong cùng một trang
 * (khi còn ảnh chưa dùng). Trả về map serviceId → url.
 */
export function assignServiceImages(services: { id: string; name: string; categoryId?: string }[]): Record<string, string> {
  const used = new Set<ImageKey>();
  const out: Record<string, string> = {};
  const pending: typeof services = [];
  for (const s of services) {
    const k = preferredKey(s);
    if (k && !used.has(k)) { used.add(k); out[s.id] = IMAGES[k]; } else pending.push(s);
  }
  for (const s of pending) {
    const pool = [...(CATEGORY_POOL[s.categoryId ?? ''] ?? []), ...SERVICE_KEYS];
    const k = pool.find((key) => !used.has(key)) ?? preferredKey(s) ?? pool[0];
    used.add(k); out[s.id] = IMAGES[k];
  }
  return out;
}

/** Ảnh cho một dịch vụ đơn lẻ. */
export function serviceImage(service: { id: string; name: string; categoryId?: string }): string {
  const k = preferredKey(service) ?? CATEGORY_POOL[service.categoryId ?? '']?.[0] ?? 'combo_vip';
  return IMAGES[k];
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * Ảnh đại diện thợ: giữ ảnh tiệm tự tải lên; thợ mẫu dùng ảnh cố định;
 * thợ mới chưa có ảnh nhận một ảnh ổn định theo mã.
 */
export function stylistPhoto(id: string, url?: string | null): string {
  if (url && !url.includes('images.unsplash.com')) return url;
  return STYLIST_BY_ID[id] ?? url ?? STYLIST_POOL[hash(id) % STYLIST_POOL.length];
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('');
