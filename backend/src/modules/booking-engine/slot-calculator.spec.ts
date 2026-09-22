import {
  computeAvailableSlots, computeFreeIntervals, intersect, isSlotAvailable, longestShiftLength,
  mergeIntervals, subtractIntervals, sumDuration, toHHmm, toMinutes, SlotCalcInput,
} from './slot-calculator';

/**
 * Bộ kiểm thử bộ tính khung giờ trống — 30+ ca theo yêu cầu giảm thiểu rủi ro
 * của kế hoạch sprint, phủ dịch vụ 30 / 60 / 120 phút, ca gãy, nghỉ giữa ca,
 * ngày nghỉ và nhiều dịch vụ cộng dồn.
 */

const base = (over: Partial<SlotCalcInput> = {}): SlotCalcInput => ({
  salonOpen: '08:00',
  salonClose: '20:00',
  shifts: [{ startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' }],
  busy: [],
  totalDuration: 60,
  stepMinutes: 15,
  ...over,
});

describe('Hàm tiện ích thời gian', () => {
  it('01. toMinutes đổi HH:mm sang phút', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('14:30:00')).toBe(870);
  });

  it('02. toMinutes ném lỗi với giờ sai định dạng', () => {
    expect(() => toMinutes('24:00')).toThrow();
    expect(() => toMinutes('9:00')).toThrow();
    expect(() => toMinutes('abc')).toThrow();
  });

  it('03. toHHmm đổi ngược lại đúng', () => {
    expect(toHHmm(0)).toBe('00:00');
    expect(toHHmm(570)).toBe('09:30');
    expect(toHHmm(1439)).toBe('23:59');
  });

  it('04. intersect trả về phần giao', () => {
    expect(intersect({ start: 0, end: 100 }, { start: 50, end: 150 })).toEqual({ start: 50, end: 100 });
    expect(intersect({ start: 0, end: 50 }, { start: 50, end: 100 })).toBeNull();
  });

  it('05. mergeIntervals gộp khoảng chồng lấn và liền kề', () => {
    expect(mergeIntervals([{ start: 0, end: 30 }, { start: 20, end: 60 }, { start: 60, end: 90 }]))
      .toEqual([{ start: 0, end: 90 }]);
  });

  it('06. subtractIntervals cắt đúng phần giữa', () => {
    expect(subtractIntervals([{ start: 0, end: 120 }], [{ start: 30, end: 60 }]))
      .toEqual([{ start: 0, end: 30 }, { start: 60, end: 120 }]);
  });

  it('07. subtractIntervals xoá sạch khi block phủ toàn bộ', () => {
    expect(subtractIntervals([{ start: 0, end: 60 }], [{ start: 0, end: 60 }])).toEqual([]);
  });

  it('08. sumDuration cộng dồn nhiều dịch vụ', () => {
    expect(sumDuration([{ durationMinutes: 30 }, { durationMinutes: 120 }])).toBe(150);
    expect(sumDuration([])).toBe(0);
  });

  it('09. longestShiftLength trừ cả giờ nghỉ giữa ca', () => {
    expect(longestShiftLength([{ startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' }]))
      .toBe(480);
  });
});

describe('computeFreeIntervals', () => {
  it('10. Ca 09:00-18:00 nghỉ trưa 12:00-13:00 cho 2 khoảng rảnh', () => {
    expect(computeFreeIntervals(base())).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1080 },
    ]);
  });

  it('11. Ca bị cắt theo giờ mở cửa của tiệm', () => {
    const free = computeFreeIntervals(base({
      salonOpen: '10:00', salonClose: '16:00',
      shifts: [{ startTime: '09:00', endTime: '18:00' }],
    }));
    expect(free).toEqual([{ start: 600, end: 960 }]);
  });

  it('12. Tiệm đóng cửa thì không còn khoảng rảnh nào', () => {
    expect(computeFreeIntervals(base({ salonClosed: true }))).toEqual([]);
  });

  it('13. Thợ không có ca thì không còn khoảng rảnh nào', () => {
    expect(computeFreeIntervals(base({ shifts: [] }))).toEqual([]);
  });

  it('14. Nghỉ cả ngày (không giờ) xoá sạch khoảng rảnh', () => {
    expect(computeFreeIntervals(base({ timeOff: [{}] }))).toEqual([]);
  });

  it('15. Nghỉ theo khoảng giờ chỉ cắt đúng phần đó', () => {
    const free = computeFreeIntervals(base({
      shifts: [{ startTime: '09:00', endTime: '18:00' }],
      timeOff: [{ startTime: '14:00', endTime: '18:00' }],
    }));
    expect(free).toEqual([{ start: 540, end: 840 }]);
  });

  it('16. Ca gãy (2 ca trong ngày) giữ nguyên 2 khoảng tách rời', () => {
    const free = computeFreeIntervals(base({
      shifts: [
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '15:00', endTime: '20:00' },
      ],
    }));
    expect(free).toEqual([{ start: 540, end: 720 }, { start: 900, end: 1200 }]);
  });

  it('17. Lịch hẹn đã có bị trừ khỏi khoảng rảnh', () => {
    const free = computeFreeIntervals(base({
      shifts: [{ startTime: '09:00', endTime: '18:00' }],
      busy: [{ start: 600, end: 720 }],
    }));
    expect(free).toEqual([{ start: 540, end: 600 }, { start: 720, end: 1080 }]);
  });

  it('18. Nhiều lịch hẹn liền nhau được gộp trước khi trừ', () => {
    const free = computeFreeIntervals(base({
      shifts: [{ startTime: '09:00', endTime: '18:00' }],
      busy: [{ start: 600, end: 660 }, { start: 660, end: 720 }],
    }));
    expect(free).toEqual([{ start: 540, end: 600 }, { start: 720, end: 1080 }]);
  });
});

describe('computeAvailableSlots — dịch vụ 30 phút', () => {
  const input = () => base({ totalDuration: 30, shifts: [{ startTime: '09:00', endTime: '11:00' }] });

  it('19. Ca 2 tiếng trống hoàn toàn cho 7 khung giờ cách nhau 15 phút', () => {
    expect(computeAvailableSlots(input())).toEqual([
      '09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30',
    ]);
  });

  it('20. Khung giờ cuối cùng luôn kết thúc đúng bằng giờ tan ca', () => {
    const slots = computeAvailableSlots(input());
    expect(slots[slots.length - 1]).toBe('10:30');
  });

  it('21. Lịch hẹn 09:30-10:00 loại đúng các khung giờ đè lên', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 30,
      shifts: [{ startTime: '09:00', endTime: '11:00' }],
      busy: [{ start: 570, end: 600 }],
    }));
    expect(slots).toEqual(['09:00', '10:00', '10:15', '10:30']);
  });

  it('22. earliestStartMinutes loại khung giờ quá sát hiện tại', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 30,
      shifts: [{ startTime: '09:00', endTime: '11:00' }],
      earliestStartMinutes: 615, // 10:15
    }));
    expect(slots).toEqual(['10:15', '10:30']);
  });
});

describe('computeAvailableSlots — dịch vụ 60 phút', () => {
  it('23. Nghỉ trưa chia ca thành hai cụm khung giờ', () => {
    const slots = computeAvailableSlots(base({ totalDuration: 60 }));
    expect(slots[0]).toBe('09:00');
    expect(slots).toContain('11:00');
    expect(slots).not.toContain('11:15'); // 11:15 + 60' đè vào nghỉ trưa 12:00
    expect(slots).toContain('13:00');
    expect(slots[slots.length - 1]).toBe('17:00');
  });

  it('24. Khoảng rảnh ngắn hơn thời lượng thì không sinh khung giờ nào', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 60,
      shifts: [{ startTime: '09:00', endTime: '09:45' }],
    }));
    expect(slots).toEqual([]);
  });

  it('25. Ca lẻ 09:10 vẫn canh khung giờ theo lưới đồng hồ', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 60,
      shifts: [{ startTime: '09:10', endTime: '11:00' }],
    }));
    expect(slots).toEqual(['09:15', '09:30', '09:45', '10:00']);
  });
});

describe('computeAvailableSlots — dịch vụ 120 phút và gói nhiều dịch vụ', () => {
  it('26. 120 phút không lọt qua được khe 09:00-12:00 sau 10:00', () => {
    const slots = computeAvailableSlots(base({ totalDuration: 120 }));
    expect(slots).toContain('09:00');
    expect(slots).toContain('10:00');
    expect(slots).not.toContain('10:15');
    expect(slots).toContain('13:00');
    expect(slots[slots.length - 1]).toBe('16:00');
  });

  it('27. Gói cắt 30 + nhuộm 120 = 150 phút chỉ lọt vào khe đủ dài, không đè nghỉ trưa', () => {
    const total = sumDuration([{ durationMinutes: 30 }, { durationMinutes: 120 }]);
    expect(total).toBe(150);
    const slots = computeAvailableSlots(base({ totalDuration: total }));
    // Khe sáng 09:00-12:00 dài 180 phút nên còn đúng 3 khung giờ
    expect(slots.slice(0, 3)).toEqual(['09:00', '09:15', '09:30']);
    // 09:45 + 150 phút = 12:15 sẽ đè vào nghỉ trưa nên bị loại
    expect(slots).not.toContain('09:45');
    expect(slots).toContain('13:00');
    expect(slots[slots.length - 1]).toBe('15:30');
  });

  it('28. Gói 150 phút với ca liền mạch 08:00-20:00 thì có cả khung giờ sáng', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 150,
      shifts: [{ startTime: '08:00', endTime: '20:00' }],
    }));
    expect(slots[0]).toBe('08:00');
    expect(slots[slots.length - 1]).toBe('17:30');
  });

  it('29. Tổng thời lượng vượt độ dài ca thì không có khung giờ nào', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 300,
      shifts: [{ startTime: '09:00', endTime: '13:00' }],
    }));
    expect(slots).toEqual([]);
  });

  it('30. Tổng thời lượng bằng 0 hoặc âm trả về mảng rỗng', () => {
    expect(computeAvailableSlots(base({ totalDuration: 0 }))).toEqual([]);
    expect(computeAvailableSlots(base({ totalDuration: -30 }))).toEqual([]);
  });
});

describe('Tình huống hỗn hợp và isSlotAvailable', () => {
  it('31. Ca gãy + 2 lịch hẹn + nghỉ chiều cho kết quả đúng', () => {
    const slots = computeAvailableSlots({
      salonOpen: '08:00',
      salonClose: '21:00',
      shifts: [
        { startTime: '08:30', endTime: '12:30' },
        { startTime: '14:00', endTime: '20:00' },
      ],
      timeOff: [{ startTime: '18:00', endTime: '20:00' }],
      busy: [{ start: 540, end: 630 }, { start: 900, end: 960 }],
      totalDuration: 60,
      stepMinutes: 15,
    });
    expect(slots).toEqual([
      '10:30', '10:45', '11:00', '11:15', '11:30',
      '14:00',
      '16:00', '16:15', '16:30', '16:45', '17:00',
    ]);
  });

  it('32. isSlotAvailable chấp nhận khung giờ nằm trọn trong khoảng rảnh', () => {
    expect(isSlotAvailable(base({ totalDuration: 60 }), '09:00')).toBe(true);
    expect(isSlotAvailable(base({ totalDuration: 60 }), '11:30')).toBe(false);
    expect(isSlotAvailable(base({ totalDuration: 60 }), '13:00')).toBe(true);
  });

  it('33. isSlotAvailable từ chối khung giờ sớm hơn mốc cho phép', () => {
    expect(isSlotAvailable(base({ totalDuration: 60, earliestStartMinutes: 600 }), '09:00')).toBe(false);
    expect(isSlotAvailable(base({ totalDuration: 60, earliestStartMinutes: 600 }), '10:00')).toBe(true);
  });

  it('34. Bước nhảy 30 phút cho danh sách thưa hơn', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 60, stepMinutes: 30, shifts: [{ startTime: '09:00', endTime: '12:00' }],
    }));
    expect(slots).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });

  it('35. Ngày kín lịch hoàn toàn trả về mảng rỗng', () => {
    const slots = computeAvailableSlots(base({
      totalDuration: 60,
      shifts: [{ startTime: '09:00', endTime: '12:00' }],
      busy: [{ start: 540, end: 720 }],
    }));
    expect(slots).toEqual([]);
  });
});
