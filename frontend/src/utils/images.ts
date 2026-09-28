/**
 * Thư viện ảnh HD cho dịch vụ & chuyên viên.
 * Mỗi dịch vụ / thợ có ảnh riêng — không dùng chung một ảnh cho cả danh mục.
 *
 * TOÀN BỘ mã ảnh dưới đây đã được kiểm tra tải được thật (28/09/2026). Ảnh cũ
 * `photo-1512290900672-1f5be661f061` (trị mụn) đã bị Unsplash gỡ → gây khung ảnh trống, nay đã thay.
 * Nếu sau này một ảnh bị gỡ, SmartImage tự thử ảnh dự phòng cùng chủ đề (KIND_ALTERNATES)
 * rồi mới tới nền gradient — không bao giờ lộ khung ảnh vỡ.
 */
const u = (id: string, w = 800, q = 80) => `https://images.unsplash.com/photo-${id}?w=${w}&q=${q}&auto=format&fit=crop`;

export const IMAGES = {
  hair_cut_men: u('1503951914875-452162b0f3f1'),
  hair_cut_women: u('1560066984-138dadb4c035'),
  hair_dye_balayage: u('1522337360788-8b13dee7a37e'),
  hair_perm_curly: u('1580618672591-eb180b1a973f'),
  hair_treatment: u('1527799820374-dcf8d9d4a388'),
  hair_styling: u('1582095133179-bfd08e2fc6b3'),
  spa_head_wash: u('1540555700478-4be289fbecef'),
  spa_massage_neck: u('1519823551278-64ac92734fb1'),
  spa_hot_stone: u('1600334129128-685c5582fd35'),
  skin_facial_care: u('1570172619644-dfd03ed5d881'),
  skin_acne_treatment: u('1552693673-1bf958298935'),
  skin_mask: u('1616394584738-fc6e612e71b9'),
  skin_serum: u('1573461160327-b450ce3d8e7f'),
  nail_art_spa: u('1632345031435-8727f6897d53'),
  nail_polish: u('1610992015732-2449b76344bc'),
  nail_care: u('1519014816548-bf5fe059798b'),
  makeup_party: u('1487412947147-5cebf100ffc2'),
  makeup_products: u('1522335789203-aabd1fc54bc9'),
  combo_vip: u('1562322140-8baeececf3df'),
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
  st1: STYLIST_PHOTOS.stylist_1, // Nguyễn Thu Hà      — stylist1@salon.vn
  st2: STYLIST_PHOTOS.stylist_2, // Trần Minh Tuấn     — stylist2@salon.vn
  st3: STYLIST_PHOTOS.stylist_3, // Lê Thị Bích Ngọc   — stylist3@salon.vn
  st4: STYLIST_PHOTOS.stylist_4, // Phạm Quốc Bảo      — stylist4@salon.vn
  st5: STYLIST_PHOTOS.stylist_5, // Võ Kim Chi         — stylist5@salon.vn
};
const STYLIST_POOL = Object.values(STYLIST_PHOTOS);

/** Chủ đề hình ảnh của dịch vụ — quyết định ảnh dự phòng + nền gradient khi ảnh không tải được. */
export type MediaKind = 'hair' | 'wash' | 'skin' | 'massage' | 'combo' | 'nail' | 'makeup' | 'spa' | 'person';

/** Ảnh chuẩn theo mã dịch vụ mẫu (bản demo). */
const SERVICE_BY_ID: Record<string, ImageKey> = {
  s1: 'hair_cut_women', s2: 'hair_dye_balayage', s3: 'hair_perm_curly',
  s4: 'spa_head_wash', s5: 'spa_relax_wash', s6: 'hair_treatment',
  s7: 'skin_facial_care', s8: 'skin_mask', s9: 'spa_face_massage',
  s10: 'combo_vip', s11: 'spa_massage_neck', s12: 'spa_couple',
};

/** Luật theo từ khoá (tên đã bỏ dấu) cho dịch vụ do tiệm tự thêm / dữ liệu máy chủ thật. */
const KEYWORD_RULES: [RegExp, ImageKey][] = [
  [/(trang diem|make ?up|co dau|ky yeu)/, 'makeup_party'],
  [/(son gel|son mong|ve mong|nail art)/, 'nail_polish'],
  [/(\bnail\b|\bmong\b|pedicure|manicure|cham soc mong)/, 'nail_art_spa'],
  [/(toc nam|barber|fade|undercut)/, 'hair_cut_men'],
  [/(nhuom|balayage|highlight|mau toc)/, 'hair_dye_balayage'],
  [/(\buon\b|\bsong\b|xoan|perm)/, 'hair_perm_curly'],
  [/(phuc hoi|keratin|u toc|hap dau|nano|duong toc)/, 'hair_treatment'],
  [/(\bsay\b|tao kieu|bui toc|tet toc|styling)/, 'hair_styling'],
  [/(\bcat\b|layer)/, 'hair_cut_women'],
  [/(\bmun\b|nan mun|lam sach sau|thai doc|tri lieu)/, 'skin_acne_treatment'],
  [/(mat na|dap mat|sang da|trang da)/, 'skin_mask'],
  [/(serum|tinh chat|cang bong|cap nuoc)/, 'skin_serum'],
  [/(massage mat|nang co)/, 'spa_face_massage'],
  [/(\bda\b|facial|cap am)/, 'skin_facial_care'],
  [/(da nong|hot stone|\bda muoi\b)/, 'spa_hot_stone'],
  [/(cap doi|couple|hai nguoi)/, 'spa_couple'],
  [/(vai gay|massage|tinh dau|aroma|bam huyet|body)/, 'spa_massage_neck'],
  [/(goi duong sinh|thao moc|goi dau)/, 'spa_head_wash'],
  [/(\bgoi\b|thu gian)/, 'spa_relax_wash'],
  [/(combo|\bvip\b|tron goi|mot ngay|goi dich vu)/, 'combo_vip'],
];

/** Ảnh theo chủ đề — vừa để chia ảnh không trùng, vừa làm ảnh dự phòng khi ảnh chính lỗi. */
const KIND_POOL: Record<MediaKind, ImageKey[]> = {
  hair: ['hair_cut_women', 'hair_dye_balayage', 'hair_perm_curly', 'hair_styling', 'hair_treatment', 'hair_cut_men'],
  wash: ['spa_head_wash', 'spa_relax_wash', 'hair_treatment', 'spa_massage_neck'],
  skin: ['skin_facial_care', 'skin_acne_treatment', 'skin_mask', 'skin_serum', 'spa_face_massage'],
  massage: ['spa_massage_neck', 'spa_hot_stone', 'spa_face_massage', 'spa_couple'],
  combo: ['combo_vip', 'spa_couple', 'spa_hot_stone', 'spa_massage_neck'],
  nail: ['nail_art_spa', 'nail_polish', 'nail_care'],
  makeup: ['makeup_party', 'makeup_products', 'skin_serum'],
  spa: ['spa_hot_stone', 'combo_vip', 'spa_relax_wash', 'skin_serum'],
  person: [],
};

/** URL ảnh dự phòng theo chủ đề (SmartImage thử lần lượt trước khi dùng nền gradient). */
export const KIND_ALTERNATES: Record<MediaKind, string[]> = Object.fromEntries(
  Object.entries(KIND_POOL).map(([kind, keys]) => [kind, keys.map((k) => IMAGES[k])]),
) as Record<MediaKind, string[]>;

const KIND_BY_CATEGORY: Record<string, MediaKind> = { hair: 'hair', wash: 'wash', skin: 'skin', combo: 'combo' };

export const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Nhận diện chủ đề dịch vụ theo tên (bỏ dấu) rồi tới nhóm, dùng cho ảnh dự phòng + nền offline. */
export function serviceMediaKind(service: { name: string; categoryId?: string; categoryName?: string }): MediaKind {
  const name = stripAccents(service.name);
  if (/(trang diem|make ?up|co dau)/.test(name)) return 'makeup';
  if (/(nail|\bmong\b|son gel|pedicure|manicure)/.test(name)) return 'nail';
  if (/(combo|\bvip\b|tron goi|mot ngay|cap doi)/.test(name)) return 'combo';
  if (/(massage|vai gay|tinh dau|aroma|bam huyet|da nong)/.test(name)) return 'massage';
  if (/(\bgoi\b|thao moc|duong sinh)/.test(name)) return 'wash';
  if (/(\bda\b|facial|mat na|\bmun\b|cap am|skin|serum)/.test(name)) return 'skin';
  if (/(\btoc\b|\bcat\b|nhuom|\buon\b|hair|barber|\bsay\b)/.test(name)) return 'hair';
  const byId = KIND_BY_CATEGORY[service.categoryId ?? ''];
  if (byId) return byId;
  const category = stripAccents(service.categoryName ?? '');
  if (/(trang diem|make ?up)/.test(category)) return 'makeup';
  if (/(mong|nail)/.test(category)) return 'nail';
  if (/\btoc\b/.test(category)) return 'hair';
  if (/\bgoi\b/.test(category)) return 'wash';
  if (/\bda\b/.test(category)) return 'skin';
  if (/massage/.test(category)) return 'massage';
  if (/combo/.test(category)) return 'combo';
  return 'spa';
}

type ServiceLike = { id: string; name: string; categoryId?: string; categoryName?: string };

function preferredKey(service: ServiceLike): ImageKey | undefined {
  if (SERVICE_BY_ID[service.id]) return SERVICE_BY_ID[service.id];
  const name = stripAccents(service.name);
  return KEYWORD_RULES.find(([re]) => re.test(name))?.[1];
}

const SERVICE_KEYS = (Object.keys(IMAGES) as ImageKey[]).filter((k) => k !== 'hero_spa_interior');

/**
 * Gán ảnh cho cả danh sách dịch vụ, bảo đảm KHÔNG trùng ảnh trong cùng một trang
 * (khi còn ảnh chưa dùng). Ưu tiên ảnh cùng chủ đề. Trả về map serviceId → url.
 */
export function assignServiceImages(services: ServiceLike[]): Record<string, string> {
  const used = new Set<ImageKey>();
  const out: Record<string, string> = {};
  const pending: ServiceLike[] = [];
  for (const s of services) {
    const k = preferredKey(s);
    if (k && !used.has(k)) { used.add(k); out[s.id] = IMAGES[k]; } else pending.push(s);
  }
  for (const s of pending) {
    const pool = [...KIND_POOL[serviceMediaKind(s)], ...SERVICE_KEYS];
    const k = pool.find((key) => !used.has(key)) ?? preferredKey(s) ?? pool[0];
    used.add(k); out[s.id] = IMAGES[k];
  }
  return out;
}

/** Ảnh cho một dịch vụ đơn lẻ. */
export function serviceImage(service: ServiceLike): string {
  const k = preferredKey(service) ?? KIND_POOL[serviceMediaKind(service)][0] ?? 'combo_vip';
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
