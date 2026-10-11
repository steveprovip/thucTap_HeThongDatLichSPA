/**
 * TASK v4 · NV2 — DỮ LIỆU THỰC TẾ cho môi trường phát triển / trình diễn: danh mục dịch vụ chuẩn salon & spa cao cấp,
 * ảnh Unsplash đúng chuyên ngành cho TỪNG dịch vụ (đã kiểm tra tải được 11/10/2026), đội ngũ chuyên viên có kỹ năng thật,
 * SĐT theo dải số di động Việt Nam. Thay toàn bộ dữ liệu "Tải thử DV 001..100" / "[scale-seed] Gói tải thử" cũ.
 *
 * Mã cố định (UUID) để chạy lại nhiều lần không nhân đôi: 12 dịch vụ + 4 nhóm + 5 thợ GỐC giữ mã của seed.sql (đổi tên,
 * thêm ảnh), phần mở rộng dùng dải mã riêng `…-1000000000NN` (seed.sql bỏ qua dải này khi tự sinh ca / lịch hẹn).
 */

const img = (id: string): string => `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`;
const face = (id: string): string => `https://images.unsplash.com/photo-${id}?w=400&h=400&q=80&auto=format&fit=crop&crop=faces`;

export interface CategorySeed { id: string; name: string; order: number; /** Tên cũ trong seed.sql (đổi tên nếu chưa bị sửa tay). */ oldName?: string }

export const CATEGORIES: CategorySeed[] = [
  { id: '44444444-4444-4444-8444-000000000001', name: 'Cắt & tạo kiểu tóc', order: 1, oldName: 'Tóc' },
  { id: '44444444-4444-4444-8444-100000000001', name: 'Uốn - Nhuộm - Phục hồi', order: 2 },
  { id: '44444444-4444-4444-8444-000000000002', name: 'Gội đầu dưỡng sinh', order: 3, oldName: 'Gội - Dưỡng' },
  { id: '44444444-4444-4444-8444-000000000003', name: 'Chăm sóc da', order: 4 },
  { id: '44444444-4444-4444-8444-100000000002', name: 'Massage & Body', order: 5 },
  { id: '44444444-4444-4444-8444-100000000003', name: 'Nail - Chăm sóc móng', order: 6 },
  { id: '44444444-4444-4444-8444-000000000004', name: 'Trang điểm & Nối mi', order: 7, oldName: 'Trang điểm & Móng' },
  { id: '44444444-4444-4444-8444-100000000004', name: 'Gói combo tiết kiệm', order: 8 },
];

const [CUT, CHEM, WASH, SKIN, BODY, NAIL, MAKEUP, COMBO] = CATEGORIES.map((c) => c.id);

export type ServiceKey =
  | 'cut_men' | 'cut_women' | 'cut_kids' | 'blowout_updo' | 'beard'
  | 'perm_korean' | 'dye_balayage' | 'straight_collagen' | 'keratin' | 'dye_gray' | 'dye_ombre' | 'perm_digital' | 'bond_repair' | 'oil_collagen'
  | 'wash_herbal' | 'wash_neck' | 'wash_foot' | 'scalp_detox'
  | 'facial_vitc' | 'acne' | 'face_massage' | 'facial_ha' | 'electroporation' | 'gold_mask' | 'peel'
  | 'hot_stone' | 'acupressure_neck' | 'aroma' | 'foot_massage' | 'body_whitening' | 'herbal_steam'
  | 'gel_art' | 'gel_basic' | 'acrylic' | 'manicure' | 'pedicure'
  | 'makeup_party' | 'makeup_bridal' | 'makeup_event' | 'lash_classic'
  | 'combo_cut_wash' | 'combo_relax_vip' | 'combo_bride';

export interface ServiceSeed {
  key: ServiceKey;
  id: string;
  categoryId: string;
  name: string;
  /** Tên cũ trong seed.sql — dịch vụ gốc được đổi sang tên thực tế nếu chủ tiệm chưa sửa tay. */
  oldName?: string;
  /** Bội số 15, 15–240 phút (bất biến S1-05). */
  duration: number;
  /** ≤ 20.000.000 đ. */
  price: number;
  description: string;
  imageUrl: string;
  /** Trọng số được đặt (dịch vụ phổ biến xuất hiện nhiều hơn trong lịch sử → "dịch vụ hot", combo, giờ vàng có ý nghĩa). */
  weight: number;
}

const S = (n: number): string => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const X = (n: number): string => `55555555-5555-4555-8555-1${String(n).padStart(11, '0')}`;

export const SERVICES: ServiceSeed[] = [
  // ---- Cắt & tạo kiểu
  { key: 'cut_men', id: S(1), categoryId: CUT, name: 'Cắt tóc nam tạo kiểu Barber', oldName: 'Cắt tóc nam', duration: 30, price: 120000,
    description: 'Tư vấn kiểu theo khuôn mặt, cắt fade / undercut / side-part, gội và vuốt sáp tạo kiểu.', imageUrl: img('1503951914875-452162b0f3f1'), weight: 10 },
  { key: 'cut_women', id: S(2), categoryId: CUT, name: 'Cắt tóc nữ layer tạo kiểu', oldName: 'Cắt tóc nữ', duration: 45, price: 180000,
    description: 'Cắt layer, tỉa mái và sấy phồng tạo kiểu theo dáng mặt, tặng gội thảo dược.', imageUrl: img('1560066984-138dadb4c035'), weight: 10 },
  { key: 'cut_kids', id: X(1), categoryId: CUT, name: 'Cắt tóc trẻ em', duration: 30, price: 90000,
    description: 'Cắt nhanh, nhẹ nhàng cho bé dưới 10 tuổi, ghế ngồi riêng và đồ chơi giữ bé vui.', imageUrl: img('1704072650662-76df3af134a7'), weight: 3 },
  { key: 'blowout_updo', id: X(2), categoryId: CUT, name: 'Sấy tạo kiểu & bới tóc dự tiệc', duration: 45, price: 250000,
    description: 'Sấy phồng, uốn lọn bằng máy hoặc bới tóc kiểu Hàn cho tiệc cưới, sự kiện.', imageUrl: img('1774660810811-fc81a515311d'), weight: 3 },
  { key: 'beard', id: X(3), categoryId: CUT, name: 'Cạo mặt & tỉa râu kiểu Barber', duration: 30, price: 100000,
    description: 'Đắp khăn nóng, cạo mặt bằng dao thẳng, tỉa và định hình râu gọn gàng.', imageUrl: img('1599011176306-4a96f1516d4d'), weight: 3 },
  // ---- Uốn - Nhuộm - Phục hồi
  { key: 'perm_korean', id: S(3), categoryId: CHEM, name: 'Uốn sóng lơi Hàn Quốc', oldName: 'Uốn tóc cao cấp', duration: 120, price: 850000,
    description: 'Uốn nóng setting tạo sóng lơi tự nhiên, kèm hấp dưỡng phục hồi sau uốn.', imageUrl: img('1580618672591-eb180b1a973f'), weight: 4 },
  { key: 'dye_balayage', id: S(4), categoryId: CHEM, name: 'Nhuộm Balayage thời trang', oldName: 'Nhuộm tóc thời trang', duration: 120, price: 950000,
    description: 'Nhuộm loang Balayage chuyển màu mềm mại, tẩy nền nhẹ và ủ dưỡng bảo vệ màu.', imageUrl: img('1522337360788-8b13dee7a37e'), weight: 4 },
  { key: 'straight_collagen', id: S(5), categoryId: CHEM, name: 'Duỗi thẳng phồng chân Collagen', oldName: 'Duỗi tóc Collagen', duration: 120, price: 900000,
    description: 'Duỗi thẳng mượt, giữ phồng chân tóc tự nhiên, bổ sung Collagen chống khô xơ.', imageUrl: img('1582095133179-bfd08e2fc6b3'), weight: 3 },
  { key: 'keratin', id: S(7), categoryId: CHEM, name: 'Phục hồi tóc Keratin Nano', oldName: 'Hấp dầu phục hồi', duration: 60, price: 320000,
    description: 'Phục hồi tóc hư tổn bằng Keratin dạng nano, tóc mềm mượt và bóng khoẻ ngay sau buổi đầu.', imageUrl: img('1527799820374-dcf8d9d4a388'), weight: 5 },
  { key: 'dye_gray', id: X(4), categoryId: CHEM, name: 'Nhuộm phủ bạc thảo dược', duration: 90, price: 450000,
    description: 'Nhuộm phủ bạc bằng thảo dược thiên nhiên, không rát da đầu, màu bền 6–8 tuần.', imageUrl: img('1638064432648-bc2f9a91b06b'), weight: 3 },
  { key: 'dye_ombre', id: X(5), categoryId: CHEM, name: 'Nhuộm highlight Ombre', duration: 150, price: 1250000,
    description: 'Highlight Ombre chuyển màu từ chân tới ngọn, tẩy chọn lọc và phủ bóng giữ màu.', imageUrl: img('1785456411888-c2e842552820'), weight: 2 },
  { key: 'perm_digital', id: X(6), categoryId: CHEM, name: 'Uốn setting Digital Perm', duration: 150, price: 1150000,
    description: 'Uốn kỹ thuật số giữ nếp lâu, lọn xoăn bồng bềnh, phù hợp cả nam và nữ.', imageUrl: img('1611590027211-b954fd027b51'), weight: 2 },
  { key: 'bond_repair', id: X(7), categoryId: CHEM, name: 'Phục hồi liên kết tóc chuyên sâu', duration: 90, price: 850000,
    description: 'Tái tạo liên kết bên trong sợi tóc cho tóc tẩy nhuộm nhiều, giảm gãy rụng rõ rệt.', imageUrl: img('1707979577466-2d6109c68a45'), weight: 2 },
  { key: 'oil_collagen', id: X(8), categoryId: CHEM, name: 'Hấp dầu Collagen siêu mượt', duration: 45, price: 220000,
    description: 'Hấp dầu Collagen kết hợp massage da đầu, tóc mềm mượt, giảm chẻ ngọn.', imageUrl: img('1732861612244-5704d12e9397'), weight: 4 },
  // ---- Gội đầu dưỡng sinh
  { key: 'wash_herbal', id: S(6), categoryId: WASH, name: 'Gội đầu dưỡng sinh thảo dược', oldName: 'Gội đầu dưỡng sinh', duration: 45, price: 150000,
    description: 'Gội bồ kết – vỏ bưởi – sả chanh, massage bấm huyệt đầu, cổ, vai thư giãn sâu.', imageUrl: img('1717160675643-53a7a2ebaa9f'), weight: 9 },
  { key: 'wash_neck', id: S(8), categoryId: WASH, name: 'Gội đầu kết hợp massage cổ vai gáy', oldName: 'Gội massage cổ vai gáy', duration: 60, price: 250000,
    description: 'Gội thảo dược kèm 30 phút massage cổ vai gáy, giải toả mỏi mệt dân văn phòng.', imageUrl: img('1519823551278-64ac92734fb1'), weight: 6 },
  { key: 'wash_foot', id: X(9), categoryId: WASH, name: 'Gội thảo dược kết hợp ngâm chân', duration: 75, price: 260000,
    description: 'Gội dưỡng sinh thảo dược và ngâm chân muối khoáng gừng ấm, ngủ ngon hơn.', imageUrl: img('1577117633143-a2437fb9bdda'), weight: 3 },
  { key: 'scalp_detox', id: X(10), categoryId: WASH, name: 'Detox da đầu & trị gàu chuyên sâu', duration: 60, price: 350000,
    description: 'Soi da đầu, tẩy tế bào chết, đặc trị gàu và nhờn bằng tinh chất trà xanh – bạc hà.', imageUrl: img('1757066033634-bbbf874ce525'), weight: 2 },
  // ---- Chăm sóc da
  { key: 'facial_vitc', id: S(9), categoryId: SKIN, name: 'Chăm sóc da chuyên sâu Vitamin C', oldName: 'Chăm sóc da cơ bản', duration: 60, price: 350000,
    description: 'Làm sạch sâu, tẩy da chết, điện di tinh chất Vitamin C giúp da sáng đều màu.', imageUrl: img('1570172619644-dfd03ed5d881'), weight: 6 },
  { key: 'acne', id: S(10), categoryId: SKIN, name: 'Lấy nhân mụn chuẩn y khoa', oldName: 'Trị mụn chuyên sâu', duration: 90, price: 550000,
    description: 'Lấy nhân mụn vô khuẩn chuẩn y khoa, chiếu ánh sáng sinh học và đắp mặt nạ phục hồi.', imageUrl: img('1552693673-1bf958298935'), weight: 5 },
  { key: 'face_massage', id: S(11), categoryId: SKIN, name: 'Massage mặt nâng cơ thư giãn', oldName: 'Massage mặt thư giãn', duration: 45, price: 280000,
    description: 'Massage dẫn lưu bạch huyết, nâng cơ mặt, giảm bọng mắt và căng thẳng.', imageUrl: img('1706795034830-de41aee06afa'), weight: 4 },
  { key: 'facial_ha', id: X(11), categoryId: SKIN, name: 'Chăm sóc da cấp ẩm HA Hàn Quốc', duration: 75, price: 480000,
    description: 'Cấp ẩm đa tầng với Hyaluronic Acid, mặt nạ thạch lạnh, da căng mọng ngay sau liệu trình.', imageUrl: img('1516815989420-9cb5ef0fce78'), weight: 4 },
  { key: 'electroporation', id: X(12), categoryId: SKIN, name: 'Điện di trẻ hoá Collagen tươi', duration: 60, price: 550000,
    description: 'Điện di không kim đưa Collagen tươi vào sâu, làm mờ nếp nhăn nhỏ, da săn chắc.', imageUrl: img('1761718209852-54ca4210183e'), weight: 3 },
  { key: 'gold_mask', id: X(13), categoryId: SKIN, name: 'Tẩy tế bào chết & đắp mặt nạ vàng 24K', duration: 60, price: 420000,
    description: 'Tẩy tế bào chết enzyme, đắp mặt nạ vàng 24K giúp da rạng rỡ, mịn màng.', imageUrl: img('1761718209708-9ab9ba1c7252'), weight: 3 },
  { key: 'peel', id: X(14), categoryId: SKIN, name: 'Peel da sinh học thải độc', duration: 45, price: 650000,
    description: 'Peel sinh học nhẹ dịu, thải độc và tái tạo bề mặt da, cải thiện thâm sạm.', imageUrl: img('1713085085470-fba013d67e65'), weight: 2 },
  // ---- Massage & Body
  { key: 'hot_stone', id: X(15), categoryId: BODY, name: 'Massage body đá nóng', duration: 90, price: 590000,
    description: 'Massage toàn thân với đá bazan nóng và tinh dầu, lưu thông khí huyết, ngủ sâu.', imageUrl: img('1696841212541-449ca29397cc'), weight: 5 },
  { key: 'acupressure_neck', id: X(16), categoryId: BODY, name: 'Massage bấm huyệt cổ vai gáy', duration: 60, price: 350000,
    description: 'Bấm huyệt trị liệu cổ vai gáy, giảm đau mỏi do ngồi máy tính lâu.', imageUrl: img('1519824145371-296894a0daa9'), weight: 6 },
  { key: 'aroma', id: X(17), categoryId: BODY, name: 'Massage body tinh dầu Aroma', duration: 90, price: 520000,
    description: 'Massage Thuỵ Điển với tinh dầu thiên nhiên chọn theo tâm trạng, thư giãn toàn thân.', imageUrl: img('1700522924565-9fad1c05469e'), weight: 4 },
  { key: 'foot_massage', id: X(18), categoryId: BODY, name: 'Massage chân bấm huyệt', duration: 45, price: 220000,
    description: 'Ngâm chân thảo dược, bấm huyệt phản xạ bàn chân, giảm phù nề, mỏi chân.', imageUrl: img('1706795033796-0057e5864e6d'), weight: 4 },
  { key: 'body_whitening', id: X(19), categoryId: BODY, name: 'Tắm trắng phi thuyền Collagen', duration: 90, price: 890000,
    description: 'Ủ trắng Collagen kết hợp xông phi thuyền, da sáng mịn đều màu, an toàn.', imageUrl: img('1630595271375-5073a6c0638b'), weight: 2 },
  { key: 'herbal_steam', id: X(20), categoryId: BODY, name: 'Xông hơi thảo dược & tẩy da chết body', duration: 60, price: 380000,
    description: 'Xông hơi lá thuốc người Dao, tẩy tế bào chết muối biển toàn thân.', imageUrl: img('1660735698223-23a4edefa264'), weight: 2 },
  // ---- Nail
  { key: 'gel_art', id: X(21), categoryId: NAIL, name: 'Làm móng Gel Nail Art cao cấp', duration: 75, price: 380000,
    description: 'Sơn gel cao cấp, vẽ nghệ thuật, tráng gương hoặc đính đá theo mẫu yêu thích.', imageUrl: img('1604654894610-df63bc536371'), weight: 5 },
  { key: 'gel_basic', id: X(22), categoryId: NAIL, name: 'Sơn gel tay chân cơ bản', duration: 45, price: 180000,
    description: 'Cắt da, dũa form và sơn gel một màu bền đẹp 3–4 tuần.', imageUrl: img('1610992015762-45dca7fa3a85'), weight: 6 },
  { key: 'acrylic', id: X(23), categoryId: NAIL, name: 'Đắp móng bột / úp móng', duration: 90, price: 450000,
    description: 'Nối dài móng bằng bột acrylic hoặc móng úp, form tự nhiên, chắc chắn.', imageUrl: img('1693776529070-2cdea397595b'), weight: 3 },
  { key: 'manicure', id: X(24), categoryId: NAIL, name: 'Chăm sóc móng & da tay Spa Manicure', duration: 45, price: 200000,
    description: 'Ngâm tay sữa ấm, tẩy da chết, massage tay và dưỡng móng chắc khoẻ.', imageUrl: img('1612887390768-fb02affea7a6'), weight: 3 },
  { key: 'pedicure', id: X(25), categoryId: NAIL, name: 'Spa chân Pedicure thải độc', duration: 60, price: 280000,
    description: 'Ngâm chân thảo mộc, chà gót, massage bắp chân và chăm sóc móng chân.', imageUrl: img('1787651344170-c2f81514934d'), weight: 3 },
  // ---- Trang điểm & Nối mi
  { key: 'makeup_party', id: S(12), categoryId: MAKEUP, name: 'Trang điểm dự tiệc cao cấp', oldName: 'Trang điểm dự tiệc', duration: 60, price: 450000,
    description: 'Trang điểm tiệc tối sang trọng hoặc trong trẻo kiểu Hàn, kèm làm tóc nhẹ.', imageUrl: img('1487412947147-5cebf100ffc2'), weight: 3 },
  { key: 'makeup_bridal', id: X(26), categoryId: MAKEUP, name: 'Trang điểm cô dâu (thử + ngày cưới)', duration: 120, price: 2500000,
    description: 'Một buổi trang điểm thử và trang điểm ngày cưới, mỹ phẩm cao cấp, giữ lớp nền cả ngày.', imageUrl: img('1709477542149-f4e0e21d590b'), weight: 1 },
  { key: 'makeup_event', id: X(27), categoryId: MAKEUP, name: 'Trang điểm kỷ yếu – sự kiện', duration: 60, price: 350000,
    description: 'Trang điểm tự nhiên lên ảnh đẹp cho kỷ yếu, phỏng vấn, chụp ảnh sự kiện.', imageUrl: img('1596462502278-27bfdc403348'), weight: 2 },
  { key: 'lash_classic', id: X(28), categoryId: MAKEUP, name: 'Nối mi Classic tự nhiên', duration: 90, price: 450000,
    description: 'Nối từng sợi mi tơ mềm nhẹ, dáng mi tự nhiên, giữ đẹp 3–4 tuần.', imageUrl: img('1589710751893-f9a6770ad71b'), weight: 3 },
  // ---- Gói combo
  { key: 'combo_cut_wash', id: X(29), categoryId: COMBO, name: 'Combo Cắt + Gội dưỡng sinh + Sấy tạo kiểu', duration: 90, price: 350000,
    description: 'Trọn gói làm đẹp tóc: cắt theo dáng mặt, gội thảo dược bấm huyệt và sấy tạo kiểu.', imageUrl: img('1695527081848-1e46c06e6458'), weight: 4 },
  { key: 'combo_relax_vip', id: X(30), categoryId: COMBO, name: 'Combo Thư giãn VIP: đá nóng + chăm sóc da', duration: 150, price: 990000,
    description: 'Massage body đá nóng 90 phút và chăm sóc da cấp ẩm 60 phút trong phòng riêng.', imageUrl: img('1544161515-4ab6ce6db874'), weight: 2 },
  { key: 'combo_bride', id: X(31), categoryId: COMBO, name: 'Combo Cô dâu rạng rỡ: trang điểm + làm tóc + nail', duration: 240, price: 3200000,
    description: 'Trang điểm cô dâu, làm tóc cưới và sơn gel tay chân — trọn vẹn cho ngày trọng đại.', imageUrl: img('1631549424057-403e75d68e2f'), weight: 1 },
];

/** Dịch vụ hay được làm KÈM nhau trong cùng lịch hẹn (combo thật) — tạo dữ liệu "Combo khách hay đặt cùng". */
export const ADD_ONS: [ServiceKey, ServiceKey][] = [
  ['cut_women', 'wash_herbal'], ['cut_men', 'beard'], ['cut_men', 'wash_herbal'], ['dye_balayage', 'bond_repair'],
  ['dye_ombre', 'keratin'], ['perm_korean', 'keratin'], ['perm_digital', 'oil_collagen'], ['facial_vitc', 'face_massage'],
  ['acne', 'facial_ha'], ['gel_basic', 'pedicure'], ['gel_art', 'manicure'], ['acupressure_neck', 'foot_massage'],
  ['makeup_party', 'blowout_updo'], ['hot_stone', 'herbal_steam'],
];

export type ShiftPattern = 'full' | 'early' | 'late' | 'rotate';

export interface StylistSeed {
  id: string;
  /** Tài khoản đăng nhập stylist1..5@salon.vn (thợ gốc). */
  userId?: string;
  fullName: string;
  oldName?: string;
  gender: 'male' | 'female';
  phone: string;
  bio: string;
  avatarUrl: string;
  skills: ServiceKey[];
  /** 0 = Chủ nhật … 6 = Thứ bảy — ngày nghỉ cố định trong tuần. */
  offDay: number;
  pattern: ShiftPattern;
  /** Mức "đắt khách" (0.8 – 1.2): thợ nổi tiếng kín lịch hơn. */
  demand: number;
}

const T = (n: number): string => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const N = (n: number): string => `33333333-3333-4333-8333-1${String(n).padStart(11, '0')}`;
const U = (n: number): string => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;

export const STYLISTS: StylistSeed[] = [
  { id: T(1), userId: U(1), fullName: 'Lê Thu Hà', oldName: 'Nguyễn Thu Hà', gender: 'female', phone: '0983415276', offDay: 1, pattern: 'full', demand: 1.15,
    bio: 'Hair colorist 9 năm kinh nghiệm, chứng chỉ màu nhuộm quốc tế; chuyên Balayage, Ombre và phục hồi tóc hư tổn.',
    avatarUrl: face('1581065178047-8ee15951ede6'),
    skills: ['cut_women', 'perm_korean', 'dye_balayage', 'straight_collagen', 'keratin', 'dye_gray', 'dye_ombre', 'bond_repair', 'oil_collagen', 'wash_herbal', 'blowout_updo', 'combo_cut_wash'] },
  { id: T(2), userId: U(2), fullName: 'Trần Minh Đức', oldName: 'Trần Minh Tuấn', gender: 'male', phone: '0904721358', offDay: 2, pattern: 'rotate', demand: 1.1,
    bio: 'Barber trưởng 8 năm, chuyên fade, undercut, side-part và uốn con sâu nam; tư vấn kiểu theo khuôn mặt.',
    avatarUrl: face('1611403119860-57c4937ef987'),
    skills: ['cut_men', 'beard', 'cut_kids', 'perm_digital', 'wash_herbal', 'wash_neck', 'combo_cut_wash'] },
  { id: T(3), userId: U(3), fullName: 'Nguyễn Bảo Ngọc', oldName: 'Lê Thị Bích Ngọc', gender: 'female', phone: '0912638047', offDay: 3, pattern: 'full', demand: 1.1,
    bio: 'Chuyên viên chăm sóc da 7 năm, chứng chỉ điều dưỡng da liễu; chuyên lấy nhân mụn chuẩn y khoa và trẻ hoá da.',
    avatarUrl: face('1726067438466-df7db360f4e3'),
    skills: ['facial_vitc', 'acne', 'face_massage', 'facial_ha', 'electroporation', 'gold_mask', 'peel', 'wash_herbal'] },
  { id: T(4), userId: U(4), fullName: 'Đặng Hoài Nam', oldName: 'Phạm Quốc Bảo', gender: 'male', phone: '0386254913', offDay: 4, pattern: 'late', demand: 1.0,
    bio: 'Kỹ thuật viên massage trị liệu 6 năm, chuyên bấm huyệt cổ vai gáy, massage đá nóng và gội đầu dưỡng sinh.',
    avatarUrl: face('1757744705465-ea08b0ddc38a'),
    skills: ['wash_herbal', 'wash_neck', 'wash_foot', 'scalp_detox', 'hot_stone', 'acupressure_neck', 'aroma', 'foot_massage', 'herbal_steam', 'combo_relax_vip'] },
  { id: T(5), userId: U(5), fullName: 'Vũ Kim Chi', oldName: 'Võ Kim Chi', gender: 'female', phone: '0779312586', offDay: 0, pattern: 'early', demand: 0.95,
    bio: 'Makeup artist 8 năm, chuyên trang điểm cô dâu và sự kiện; tạo kiểu tóc bới dự tiệc.',
    avatarUrl: face('1585325313343-55a22d8d4db3'),
    skills: ['makeup_party', 'makeup_bridal', 'makeup_event', 'lash_classic', 'blowout_updo', 'facial_vitc', 'face_massage', 'combo_bride'] },
  { id: N(1), fullName: 'Phan Thuỳ Linh', gender: 'female', phone: '0987205634', offDay: 2, pattern: 'late', demand: 1.05,
    bio: 'Nail artist 5 năm, chuyên vẽ gel nghệ thuật, đính đá và đắp móng bột dáng tự nhiên.',
    avatarUrl: face('1758600587839-56ba05596c69'),
    skills: ['gel_art', 'gel_basic', 'acrylic', 'manicure', 'pedicure', 'lash_classic'] },
  { id: N(2), fullName: 'Hoàng Thuỳ Linh', gender: 'female', phone: '0903586721', offDay: 3, pattern: 'rotate', demand: 0.95,
    bio: 'Chuyên viên spa body 6 năm, chuyên tắm trắng phi thuyền, xông hơi thảo dược và massage tinh dầu.',
    avatarUrl: face('1616326431919-be810ad5dacd'),
    skills: ['body_whitening', 'herbal_steam', 'hot_stone', 'aroma', 'foot_massage', 'gold_mask', 'facial_ha', 'combo_relax_vip'] },
  { id: N(3), fullName: 'Đỗ Thanh Tâm', gender: 'female', phone: '0914827305', offDay: 1, pattern: 'early', demand: 1.0,
    bio: 'Stylist tóc nữ 7 năm, chuyên cắt layer, uốn sóng lơi Hàn Quốc và duỗi phồng chân tự nhiên.',
    avatarUrl: face('1790597035558-6108def44b04'),
    skills: ['cut_women', 'perm_korean', 'perm_digital', 'straight_collagen', 'keratin', 'oil_collagen', 'blowout_updo', 'wash_herbal', 'combo_cut_wash'] },
  { id: N(4), fullName: 'Bùi Gia Huy', gender: 'male', phone: '0389471026', offDay: 4, pattern: 'late', demand: 1.0,
    bio: 'Barber 5 năm, chuyên tóc nam Hàn Quốc, uốn premlock và nhuộm phủ bạc thảo dược.',
    avatarUrl: face('1720501828093-c792c10e3f0b'),
    skills: ['cut_men', 'beard', 'cut_kids', 'perm_digital', 'dye_gray', 'wash_herbal', 'combo_cut_wash'] },
  { id: N(5), fullName: 'Ngô Mỹ Duyên', gender: 'female', phone: '0775638149', offDay: 5, pattern: 'full', demand: 0.9,
    bio: 'Kỹ thuật viên nail & nối mi 4 năm, tỉ mỉ, nhẹ tay; chuyên mi classic tự nhiên.',
    avatarUrl: face('1582686568403-bd196482f51b'),
    skills: ['gel_basic', 'gel_art', 'manicure', 'pedicure', 'acrylic', 'lash_classic'] },
  { id: N(6), fullName: 'Huỳnh Anh Thư', gender: 'female', phone: '0981364705', offDay: 1, pattern: 'rotate', demand: 0.9,
    bio: 'Chuyên viên trang điểm cô dâu 6 năm, phong cách trong trẻo kiểu Hàn, làm tóc cưới.',
    avatarUrl: face('1618151313441-bc79b11e5090'),
    skills: ['makeup_bridal', 'makeup_event', 'makeup_party', 'blowout_updo', 'lash_classic', 'combo_bride'] },
  { id: N(7), fullName: 'Lý Quốc Khánh', gender: 'male', phone: '0908152379', offDay: 3, pattern: 'full', demand: 1.05,
    bio: 'Colorist 6 năm, chuyên highlight, Ombre và các tông màu thời trang theo xu hướng.',
    avatarUrl: face('1701980889802-55ff39e2e973'),
    skills: ['dye_balayage', 'dye_ombre', 'dye_gray', 'bond_repair', 'keratin', 'cut_men', 'cut_women'] },
  { id: N(8), fullName: 'Trịnh Ngọc Mai', gender: 'female', phone: '0917405862', offDay: 0, pattern: 'early', demand: 0.95,
    bio: 'Chuyên viên chăm sóc da & gội dưỡng sinh 5 năm, chuyên điện di Collagen và detox da đầu.',
    avatarUrl: face('1779878070528-807347e8451f'),
    skills: ['facial_vitc', 'facial_ha', 'acne', 'electroporation', 'gold_mask', 'wash_herbal', 'wash_foot', 'scalp_detox', 'face_massage'] },
  { id: N(9), fullName: 'Võ Thanh Phong', gender: 'male', phone: '0382906417', offDay: 2, pattern: 'late', demand: 1.0,
    bio: 'Kỹ thuật viên vật lý trị liệu 7 năm, chuyên bấm huyệt giảm đau cổ vai gáy và massage chân.',
    avatarUrl: face('1544168190-79c17527004f'),
    skills: ['hot_stone', 'acupressure_neck', 'aroma', 'foot_massage', 'wash_neck', 'herbal_steam', 'combo_relax_vip'] },
];

/** Khách mẫu cũ của seed.sql trùng tên với thợ mới → đổi tên để lịch không hiện "khách Phan Thuỳ Linh – thợ Phan Thuỳ Linh". */
export const CUSTOMER_RENAMES: { id: string; from: string; to: string }[] = [
  { id: '77777777-7777-4777-8777-000000000003', from: 'Phan Thuỳ Linh', to: 'Phan Thanh Trúc' },
  { id: '77777777-7777-4777-8777-000000000006', from: 'Đặng Hoài Nam', to: 'Đặng Quốc Trung' },
];

/** Dải đầu số di động Việt Nam theo yêu cầu (Viettel 098 / 038, MobiFone 090 / 077, VinaPhone 091). */
export const PHONE_PREFIXES = ['098', '090', '091', '038', '077'] as const;

export const SURNAMES: [string, number][] = [
  ['Nguyễn', 31], ['Trần', 11], ['Lê', 9], ['Phạm', 7], ['Hoàng', 4], ['Huỳnh', 4], ['Phan', 4], ['Vũ', 3], ['Võ', 3],
  ['Đặng', 2], ['Bùi', 2], ['Đỗ', 2], ['Hồ', 1.5], ['Ngô', 1.5], ['Dương', 1], ['Lý', 1], ['Trịnh', 1], ['Mai', 1], ['Đinh', 1], ['Tô', 0.5],
];

export const FEMALE_MIDDLE = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Minh', 'Bảo', 'Khánh', 'Phương', 'Mỹ', 'Hoài', 'Diệu', 'Quỳnh', 'Kim', 'Hồng', 'Gia'];
export const FEMALE_GIVEN = ['Anh', 'Trang', 'Linh', 'Hương', 'Ngân', 'Vy', 'Hà', 'Mai', 'Lan', 'Thảo', 'Nhung', 'Hạnh', 'Yến', 'Trâm', 'Uyên',
  'Nhi', 'Chi', 'Hằng', 'Quyên', 'Phương', 'Hiền', 'Tâm', 'Giang', 'My', 'Duyên', 'Thư', 'Châu', 'Ly', 'Thuỷ', 'Oanh', 'Loan', 'Trinh', 'Vân', 'Nga'];
export const MALE_MIDDLE = ['Văn', 'Minh', 'Đức', 'Quốc', 'Hoàng', 'Gia', 'Thanh', 'Hữu', 'Tuấn', 'Công', 'Anh', 'Nhật'];
export const MALE_GIVEN = ['Huy', 'Nam', 'Khoa', 'Phúc', 'Tuấn', 'Dũng', 'Long', 'Khang', 'Bảo', 'Minh', 'Quân', 'Hiếu', 'Trung', 'Hải',
  'Sơn', 'Đạt', 'Vinh', 'Thắng', 'Tài', 'Lộc', 'Kiên', 'Phong', 'Tùng', 'Hưng'];

export const CUSTOMER_NOTES = [
  'Da nhạy cảm, tránh sản phẩm có cồn.', 'Thích tông nâu lạnh, không nhuộm quá sáng.', 'Hay đặt cuối tuần, ưu tiên buổi sáng.',
  'Khách thân thiết — ưu tiên phòng riêng.', 'Dị ứng tinh dầu sả, dùng tinh dầu oải hương.', 'Tóc mỏng, cần nhẹ tay khi sấy.',
  'Thích được tư vấn kỹ trước khi làm.', 'Đang mang thai, không dùng hoá chất mạnh.', 'Hay đi cùng mẹ, đặt 2 suất liền nhau.',
  'Thích nói chuyện ít, muốn không gian yên tĩnh.',
];

export const CUSTOMER_REQUESTS = [
  'Cho em xin phòng riêng ạ.', 'Em có thể đến sớm 10 phút được không ạ?', 'Tóc em hơi yếu, nhờ nhẹ tay giúp em.',
  'Em muốn tư vấn thêm màu nhuộm khi đến.', 'Da em đang kích ứng nhẹ, nhờ kiểm tra trước giúp em.', 'Em đi cùng bé 6 tuổi ạ.',
  'Nhờ chuẩn bị nước ấm, em hay lạnh chân.', 'Em cần xong trước 17h để đi làm lại.',
];

type CategoryKind = 'hair' | 'wash' | 'skin' | 'body' | 'nail' | 'makeup';
export const kindOf = (categoryId: string): CategoryKind => (
  categoryId === CUT || categoryId === CHEM || categoryId === COMBO ? 'hair'
    : categoryId === WASH ? 'wash' : categoryId === SKIN ? 'skin' : categoryId === BODY ? 'body'
      : categoryId === NAIL ? 'nail' : 'makeup');

export const REVIEW_COMMENTS: Record<CategoryKind, { good: string[]; ok: string[] }> = {
  hair: {
    good: ['Thợ tư vấn kiểu rất hợp mặt, cắt xong ai cũng khen.', 'Màu nhuộm lên chuẩn như ảnh mẫu, tóc vẫn mềm.', 'Uốn xong sóng đẹp tự nhiên, sẽ quay lại.',
      'Làm kỹ, sạch sẽ, giá hợp lý.', 'Anh thợ cắt nhanh mà gọn, rất ưng.'],
    ok: ['Kiểu đẹp nhưng chờ hơi lâu so với giờ hẹn.', 'Màu hơi đậm hơn mong muốn một chút.'],
  },
  wash: {
    good: ['Gội đầu dưỡng sinh thư giãn cực kỳ, ngủ luôn trên ghế.', 'Bấm huyệt cổ vai gáy đỡ mỏi hẳn.', 'Thảo dược thơm, không gian yên tĩnh.'],
    ok: ['Dễ chịu nhưng nước hơi nóng.', 'Ổn, mong có thêm khăn ấm.'],
  },
  skin: {
    good: ['Chị lấy mụn rất nhẹ tay, da thông thoáng hẳn.', 'Da căng mọng ngay sau buổi đầu tiên.', 'Tư vấn routine chăm sóc da tại nhà rất có tâm.'],
    ok: ['Hiệu quả tốt nhưng hơi đau lúc lấy nhân.', 'Phòng hơi lạnh, còn lại ổn.'],
  },
  body: {
    good: ['Massage đá nóng tuyệt vời, hết đau lưng.', 'Kỹ thuật viên bấm huyệt chuẩn, lực vừa phải.', 'Không gian thơm, nhạc nhẹ, rất đáng tiền.'],
    ok: ['Ổn nhưng lực massage hơi nhẹ so với mình.', 'Tốt, chỉ là phòng bên cạnh hơi ồn.'],
  },
  nail: {
    good: ['Vẽ gel đẹp xuất sắc, bền cả tháng.', 'Bạn làm nail tỉ mỉ, form móng rất chuẩn.', 'Màu sơn nhiều, tư vấn nhiệt tình.'],
    ok: ['Đẹp nhưng làm hơi lâu.', 'Ổn, một móng bị bong sau 2 tuần.'],
  },
  makeup: {
    good: ['Lớp nền mỏng nhẹ mà giữ cả ngày, lên ảnh rất đẹp.', 'Makeup cô dâu xinh lắm, cả nhà đều khen.', 'Mi nối tự nhiên, nhẹ, không cộm.'],
    ok: ['Đẹp nhưng hơi đậm so với mình mong muốn.', 'Ổn, cần đến sớm hơn để kịp giờ.'],
  },
};

export const SERVICE_NOTES: Record<CategoryKind, string[]> = {
  hair: ['Dùng thuốc nhuộm tông nâu lạnh 6.1, ủ 35 phút.', 'Tóc yếu phần ngọn, đã cắt tỉa 2cm và hấp Keratin.', 'Uốn lọn số 26, cuộn 18 phút, khách dặn giữ độ phồng chân.',
    'Khách thích fade thấp, để mái dài 5cm.'],
  wash: ['Da đầu nhạy cảm, dùng dầu gội không sulfat.', 'Khách hay mỏi vai trái, tập trung bấm huyệt bả vai.', 'Đã tư vấn liệu trình detox da đầu 4 buổi.'],
  skin: ['Da hỗn hợp thiên dầu, mụn ẩn vùng chữ T; hẹn tái khám sau 10 ngày.', 'Đã điện di Vitamin C 15 phút, da hơi đỏ nhẹ là bình thường.',
    'Khuyên khách dùng kem chống nắng SPF50 hằng ngày.'],
  body: ['Khách thích lực mạnh vùng lưng, nhẹ vùng chân.', 'Dùng tinh dầu oải hương theo yêu cầu.', 'Có điểm đau cơ thang bên phải, nên massage định kỳ.'],
  nail: ['Khách chọn mẫu đính đá ngón áp út.', 'Móng mỏng, đã phủ base gia cố trước khi sơn.', 'Hẹn sơn lại sau 3 tuần.'],
  makeup: ['Da khô, dưỡng ẩm kỹ trước khi đánh nền.', 'Khách thích tông cam đào, mi tự nhiên.', 'Đã thử makeup, chốt lịch ngày cưới.'],
};
