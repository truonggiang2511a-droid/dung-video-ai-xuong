// BỘ PHONG CÁCH DỰNG theo MASTER EDITING RULES V1.0 (docs/MASTER-RULES-V1.md, Giang 4/11):
// "Mỗi ngành phải có phong cách dựng, nhịp, typography, motion, sound, color riêng" · "Không dùng cùng 1 template cho mọi khách".
// 20 ngành → 10 phong cách. Mỗi phong cách = THÔNG SỐ THẬT mà máy dùng (không phải tên suông):
//   pace.punchGap  : giây tối đa không có gì đổi trước khi giật zoom (99 = không giật — cinematic)
//   pace.punchKey  : giật zoom ở chữ ý chính · pace.textEvery / brollEvery : mật độ chữ / cảnh phụ (giây) gửi cho AI
//   sfx            : hi (mọi điểm nhấn) | mid (cảnh phụ + giá + chữ) | lo (giá + chương) | min (chỉ chỗ chuyển phần)
//   transitions    : kiểu vào cảnh phụ được dùng · label : kiểu nhãn · anim : kiểu chữ hiện (pop|stamp|slide|fade)
//   bLen [min,max] : giây mỗi cảnh phụ hiện (4/11 19:41 Giang: “ra quá nhanh”) · tMin : giây tối thiểu chữ điểm nhấn đứng trên màn (mẫu 1: ≥ 3 s, giữ ~1 s sau lời)
//   BĐS / doanh nghiệp / làm đẹp / cinematic: chỉ chuyển cảnh mượt (mờ, hoà, đẩy nhẹ) — bỏ whip/radial/push giật (Giang 19:41: “cảnh phụ giật lag”)
//   subs           : {look: stroke|box|clean, scale} · fonts : {head, big, lead} (≤ 3 họ font / video)
//   grade          : {sat, bri, con, warm} — warm = sepia nhẹ (ấm) · fx : {leak (vệt sáng chuyển phần), flash (chớp hết mở đầu)}
//   punch          : jump (giật zoom — mạng xã hội) | smooth (đẩy máy chậm, mượt — BĐS: “hạn chế zoom giật”) | none (cinematic)
//   pauseKeep      : khoảng nghỉ giữ lại sau khi cắt lặng (s) — phỏng vấn / tài liệu giữ dài hơn cho tự nhiên
//   coldOpen       : được đưa câu hấp dẫn lên đầu không (sự kiện / tài liệu / giáo dục: GIỮ ĐÚNG TRÌNH TỰ → không)
//   brollVol       : âm lượng tiếng môi trường của cảnh phụ (du lịch, ẩm thực: nghe tiếng thật của nơi đó)
export const STYLES = {
  bds: { name: 'Bất động sản · sáng, rõ công năng', acc: '#D1FE17', badge: ['#ff8a3d', '#ff3d6a'],
    punch: 'smooth', pauseKeep: 0.25, coldOpen: true, brollVol: 0,
    pace: { punchGap: 4.5, punchKey: true, textEvery: 5, brollEvery: 7 }, sfx: 'mid',
    transitions: ['blur', 'zoom', 'fade', 'blur'], bLen: [3.4, 4.5], tMin: 3, label: 'block', anim: 'pop', subs: { look: 'stroke', scale: 1 },
    fonts: { head: 'BVP', big: 'Anton', lead: 'Mont' }, grade: { sat: 1.15, bri: 1.10, con: 1.05, warm: 0 }, fx: { leak: true, flash: true } },
  sales: { name: 'Bán hàng / quảng cáo · nhanh, chốt đơn', acc: '#ffd84a', badge: ['#ff3d6a', '#c8101e'],
    punch: 'jump', pauseKeep: 0.2, coldOpen: true, brollVol: 0,
    pace: { punchGap: 3, punchKey: true, textEvery: 3.5, brollEvery: 5 }, sfx: 'hi',
    transitions: ['whip', 'zoom', 'slide', 'fade'], bLen: [2.4, 3.4], tMin: 2.6, label: 'bars', anim: 'stamp', subs: { look: 'stroke', scale: 1.06 },
    fonts: { head: 'BVP', big: 'Anton', lead: 'Mont' }, grade: { sat: 1.2, bri: 1.08, con: 1.08, warm: 0 }, fx: { leak: false, flash: true } },
  corporate: { name: 'Doanh nghiệp / công nghệ / tài chính · gọn, tin cậy', acc: '#5cc8ff', badge: ['#2f80ff', '#1746b8'],
    punch: 'smooth', pauseKeep: 0.3, coldOpen: true, brollVol: 0,
    pace: { punchGap: 6.5, punchKey: false, textEvery: 6, brollEvery: 8 }, sfx: 'lo',
    transitions: ['fade', 'blur'], bLen: [3, 4.2], tMin: 3, label: 'kicker', anim: 'slide', subs: { look: 'clean', scale: 0.92 },
    fonts: { head: 'Mont', big: 'Anton', lead: 'Mont' }, grade: { sat: 1.05, bri: 1.05, con: 1.06, warm: 0 }, fx: { leak: false, flash: true } },
  edu: { name: 'Giáo dục / sức khoẻ · dễ theo dõi', acc: '#5ce1ff', badge: ['#2f80ff', '#1746b8'],
    punch: 'smooth', pauseKeep: 0.3, coldOpen: false, brollVol: 0,
    pace: { punchGap: 6, punchKey: true, textEvery: 5, brollEvery: 9 }, sfx: 'lo',
    transitions: ['fade', 'blur'], bLen: [3, 4.2], tMin: 3.2, label: 'kicker', anim: 'slide', subs: { look: 'box', scale: 1 },
    fonts: { head: 'BVP', big: 'Anton', lead: 'Mont' }, grade: { sat: 1.05, bri: 1.06, con: 1.04, warm: 0 }, fx: { leak: false, flash: false } },
  food: { name: 'Ẩm thực / nhà hàng · ấm, ngon mắt', acc: '#ffb13d', badge: ['#ff7a1a', '#d94800'],
    punch: 'jump', pauseKeep: 0.25, coldOpen: true, brollVol: 0.18,
    pace: { punchGap: 4, punchKey: true, textEvery: 5, brollEvery: 5 }, sfx: 'mid',
    transitions: ['zoom', 'fade', 'blur'], bLen: [3.2, 4.5], tMin: 3, label: 'pill', anim: 'pop', subs: { look: 'stroke', scale: 1 },
    fonts: { head: 'BVP', big: 'Anton', lead: 'Sign' }, grade: { sat: 1.18, bri: 1.08, con: 1.05, warm: 0.06 }, fx: { leak: true, flash: true } },
  beauty: { name: 'Thời trang / làm đẹp · mềm, sang', acc: '#ff9fd0', badge: ['#ff6ad5', '#b03a8f'],
    punch: 'smooth', pauseKeep: 0.3, coldOpen: true, brollVol: 0.1,
    pace: { punchGap: 5, punchKey: false, textEvery: 6, brollEvery: 6 }, sfx: 'lo',
    transitions: ['blur', 'fade'], bLen: [3.4, 4.8], tMin: 3, label: 'mask', anim: 'fade', subs: { look: 'clean', scale: 0.92 },
    fonts: { head: 'Mont', big: 'Anton', lead: 'Sign' }, grade: { sat: 1.06, bri: 1.10, con: 0.98, warm: 0.03 }, fx: { leak: true, flash: false } },
  cinematic: { name: 'Du lịch / sự kiện / cưới / tài liệu · có khoảng thở', acc: '#f3e2c0', badge: ['#c9a96e', '#8a6a35'],
    punch: 'none', pauseKeep: 0.55, coldOpen: false, brollVol: 0.28,
    pace: { punchGap: 99, punchKey: false, textEvery: 12, brollEvery: 6 }, sfx: 'min',
    transitions: ['fade', 'blur'], bLen: [3.6, 5.2], tMin: 3.4, label: 'mask', anim: 'fade', subs: { look: 'clean', scale: 0.85 },
    fonts: { head: 'Mont', big: 'Anton', lead: 'Sign' }, grade: { sat: 1.05, bri: 1.02, con: 1.10, warm: 0.08 }, fx: { leak: true, flash: false } },
  interview: { name: 'Phỏng vấn / podcast · tự nhiên', acc: '#D1FE17', badge: ['#7c5cff', '#4b2bd6'],
    punch: 'jump', pauseKeep: 0.4, coldOpen: true, brollVol: 0,
    pace: { punchGap: 8, punchKey: true, textEvery: 8, brollEvery: 12 }, sfx: 'min',
    transitions: ['fade', 'blur'], bLen: [3, 4.2], tMin: 3.2, label: 'bars', anim: 'slide', subs: { look: 'box', scale: 1.05 },
    fonts: { head: 'BVP', big: 'Anton', lead: 'Mont' }, grade: { sat: 1.05, bri: 1.04, con: 1.04, warm: 0 }, fx: { leak: false, flash: false } },
  sport: { name: 'Thể thao / thể hình · mạnh, dồn dập', acc: '#7CFF4F', badge: ['#22c55e', '#0f7a33'],
    punch: 'jump', pauseKeep: 0.2, coldOpen: true, brollVol: 0.2,
    pace: { punchGap: 2.5, punchKey: true, textEvery: 4, brollEvery: 4 }, sfx: 'hi',
    transitions: ['zoom', 'whip', 'slide'], bLen: [2.2, 3.2], tMin: 2.6, label: 'bars', anim: 'stamp', subs: { look: 'stroke', scale: 1.06 },
    fonts: { head: 'BVP', big: 'Anton', lead: 'Mont' }, grade: { sat: 1.18, bri: 1.04, con: 1.12, warm: 0 }, fx: { leak: false, flash: true } },
  vlog: { name: 'Cá nhân / giải trí / sáng tạo · vui, cá tính', acc: '#ff6ad5', badge: ['#ff6ad5', '#8a2be2'],
    punch: 'jump', pauseKeep: 0.25, coldOpen: true, brollVol: 0.12,
    pace: { punchGap: 3.5, punchKey: true, textEvery: 4.5, brollEvery: 6 }, sfx: 'mid',
    transitions: ['whip', 'zoom', 'fade', 'slide'], bLen: [2.6, 3.6], tMin: 2.8, label: 'pill', anim: 'pop', subs: { look: 'stroke', scale: 1 },
    fonts: { head: 'BVP', big: 'Anton', lead: 'Sign' }, grade: { sat: 1.15, bri: 1.08, con: 1.05, warm: 0.02 }, fx: { leak: true, flash: true } },
};

// 20 ngành (Master Rules mục III) → phong cách mặc định + câu kêu gọi + gợi ý cho máy chép lời + ngành cũ (genre) để tương thích
export const INDUSTRIES = [
  ['bat-dong-san', 'Bất động sản', 'bds', 'NHẮN TIN XEM NHÀ NGAY', 'bds'],
  ['thuong-mai-dien-tu', 'Thương mại điện tử', 'sales', 'BẤM GIỎ HÀNG ĐẶT NGAY', 'banhang'],
  ['ban-hang', 'Bán hàng & quảng cáo', 'sales', 'NHẮN TIN ĐẶT HÀNG NGAY', 'banhang'],
  ['doanh-nghiep', 'Doanh nghiệp & thương hiệu', 'corporate', 'LIÊN HỆ ĐỂ ĐƯỢC TƯ VẤN', 'chung'],
  ['giao-duc', 'Giáo dục & đào tạo', 'edu', 'THEO DÕI ĐỂ HỌC THÊM', 'kienthuc'],
  ['du-lich', 'Du lịch & khách sạn', 'cinematic', 'ĐẶT PHÒNG NGAY HÔM NAY', 'vlog'],
  ['am-thuc', 'Ẩm thực & nhà hàng', 'food', 'LƯU LẠI ĐỂ THỬ NGAY', 'amthuc'],
  ['lam-dep', 'Thời trang & làm đẹp', 'beauty', 'NHẮN TIN ĐỂ ĐƯỢC TƯ VẤN', 'banhang'],
  ['suc-khoe', 'Y tế & sức khoẻ', 'edu', 'ĐẶT LỊCH TƯ VẤN NGAY', 'kienthuc'],
  ['the-thao', 'Thể thao & thể hình', 'sport', 'THEO DÕI ĐỂ TẬP CÙNG', 'vlog'],
  ['cong-nghe', 'Công nghệ & sản phẩm số', 'corporate', 'DÙNG THỬ MIỄN PHÍ', 'kienthuc'],
  ['tai-chinh', 'Tài chính & đầu tư', 'corporate', 'THEO DÕI ĐỂ CẬP NHẬT', 'kienthuc'],
  ['phong-van', 'Phỏng vấn & podcast', 'interview', 'THEO DÕI ĐỂ NGHE TẬP MỚI', 'chung'],
  ['su-kien', 'Sự kiện & đám cưới', 'cinematic', 'LIÊN HỆ ĐẶT LỊCH QUAY', 'vlog'],
  ['tai-lieu', 'Phim tài liệu', 'cinematic', 'XEM TIẾP PHẦN SAU', 'chung'],
  ['giai-tri', 'Giải trí & sáng tạo nội dung', 'vlog', 'THEO DÕI MÌNH NHÉ', 'vlog'],
  ['nghe-thuat', 'Nghệ thuật & âm nhạc', 'cinematic', 'THEO DÕI ĐỂ XEM THÊM', 'vlog'],
  ['san-xuat', 'Sản xuất & công nghiệp', 'corporate', 'LIÊN HỆ BÁO GIÁ', 'chung'],
  ['tuyen-dung', 'Tuyển dụng & nhân sự', 'corporate', 'ỨNG TUYỂN NGAY', 'chung'],
  ['ca-nhan', 'Cá nhân & thương hiệu cá nhân', 'vlog', 'THEO DÕI ĐỂ XEM THÊM', 'vlog'],
];
export const IND = Object.fromEntries(INDUSTRIES.map(([id, name, style, cta, genre]) => [id, { id, name, style, cta, genre }]));
// ngành cũ (6 nút) → ngành mới
const FROM_GENRE = { bds: 'bat-dong-san', banhang: 'ban-hang', amthuc: 'am-thuc', kienthuc: 'giao-duc', vlog: 'ca-nhan', chung: '' };

// phong cách cuối cùng: khách chọn > AI chọn > theo ngành (khách chọn / AI nhận diện) > theo ngành cũ > bds
export function resolveStyle(job, p) {
  const u = p?.understand || {};
  const ind = IND[job.industry] || IND[u.industry] || IND[FROM_GENRE[job.genre]] || null;
  const id = [job.styleOverride, job.style, u.style, ind?.style].find(x => x && STYLES[x]) || 'bds';
  return { id, ...STYLES[id], industry: ind?.id || '', industryName: ind?.name || '', cta: ind?.cta };
}
// gửi cho AI: mô tả ngắn để AI chọn đúng (không gửi hết thông số)
export const STYLE_BRIEF = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, `${v.name} — chữ mỗi ~${v.pace.textEvery} s, cảnh phụ mỗi ~${v.pace.brollEvery} s, chuyển cảnh ${v.transitions.join('/')}`]));

// LUẬT RIÊNG TỪNG NGÀNH (Giang 4/11 — Master Rules phần 2) → gửi cho AI đúng nhóm ngành của video
export const RULES = {
  bds: 'Ưu tiên cảnh tổng thể, mặt tiền, đường vào, phòng khách, bếp, phòng ngủ (theo thứ tự đi xem nhà). Dùng bản đồ vị trí, khoảng cách, tiện ích, số liệu diện tích. Làm nổi giá, pháp lý (sổ hồng), diện tích, số phòng, CTA. Không dùng cảnh sai hiện trạng căn nhà.',
  sales: 'Hook nêu LỢI ÍCH hoặc VẤN ĐỀ của khách. Sản phẩm xuất hiện rõ, ưu tiên cận cảnh chi tiết. Tính năng → mẫu list (✓ từng ý). Tập trung lợi ích, bằng chứng, CTA. Không phóng đại công dụng.',
  corporate: 'Hiện đại, đáng tin, bố cục sạch, ít chữ động. Số liệu → mẫu stat (số chạy). Quy trình → mẫu list (bước). Ưu tiên hình hoạt động thực tế. Không hiệu ứng giải trí (emoji, giật zoom).',
  edu: 'Chia chương theo từng ý (chapters). Tô từ khoá kiến thức (keywords). Các bước / ý chính → mẫu list. Ưu tiên dễ hiểu hơn hiệu ứng, chữ ít mà rõ.',
  food: 'Ưu tiên cận cảnh món, nguyên liệu, lúc nấu (khói, xèo xèo). Nêu tên món, giá, địa chỉ nếu có nói. Màu ấm, ngon mắt, không làm sai màu món.',
  beauty: 'Chú trọng ánh sáng, màu da, chất liệu, chi tiết; cận cảnh, chuyển động mềm. Chữ tinh tế, ít, không lấn át sản phẩm/người mẫu. Không giật zoom.',
  cinematic: 'Kể chuyện bằng hình, tạo cảm giác trải nghiệm. Kết hợp flycam/toàn cảnh, cận cảnh, cảnh chuyển động. GIỮ ĐÚNG TRÌNH TỰ sự kiện (không cold_open). Chọn khoảnh khắc cảm xúc, khoảng lặng có dụng ý. Chữ rất ít, không hiệu ứng phá cảm xúc.',
  interview: 'Giữ tự nhiên của người nói, cắt lỗi nhẹ tay. Thanh tên người nói (speaker), chủ đề (chapters), câu đáng chú ý → mẫu quote. Cảnh phụ ít, chỉ khi minh hoạ đúng.',
  sport: 'Nhấn chuyển động, hành động, khoảnh khắc; nhịp nhanh nhưng không mất diễn biến. Thông tin sức khoẻ phải chính xác, không hứa hẹn kết quả.',
  vlog: 'Cá tính, vui, nhiều cảm xúc; emoji hợp nghĩa, chữ điểm nhấn ngắn. Giữ giọng kể tự nhiên của người nói.',
};
