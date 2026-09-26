const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const m = require('./mock.cjs');
const call = async (method, url, data, params) => {
  try { const r = await m.mockAdapter({ method, url, data: data ? JSON.stringify(data) : undefined, params });
    return { ok: true, data: r.data.data }; }
  catch (e) { return { ok: false, status: e.response?.status, msg: e.response?.data?.message, field: e.response?.data?.field }; }
};
let pass = 0, fail = 0;
const check = (name, cond, extra) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' -> ' + JSON.stringify(extra)}`); };
(async () => {
  let r;
  r = await call('post', '/auth/login', { email: 'nobody@x.vn', password: 'demo1234' });
  check('#0.2 unknown email rejected (401, generic msg)', !r.ok && r.status === 401 && r.msg === 'Email hoặc mật khẩu không đúng', r);
  r = await call('post', '/auth/login', { email: 'reception@lumi.vn', password: 'wrong' });
  check('#0.2 wrong password rejected with same generic msg', !r.ok && r.msg === 'Email hoặc mật khẩu không đúng', r);
  for (const [email, role] of [['reception@lumi.vn','receptionist'],['minhanh@lumi.vn','stylist'],['admin@lumi.vn','admin'],['OWNER@lumi.vn','owner']]) {
    r = await call('post', '/auth/login', { email, password: 'demo1234' });
    check(`#0.1 login ${email} -> role ${role}`, r.ok && r.data.user.role === role, r);
  }
  r = await call('get', '/users'); check('S1-03 owner may list users', r.ok, r);
  r = await call('post', '/users', { fullName: 'X', email: 'x@lumi.vn', role: 'receptionist' });
  check('S1-03 owner cannot create user (403)', !r.ok && r.status === 403, r);
  r = await call('post', '/auth/login', { email: 'baongoc@lumi.vn', password: 'demo1234' });
  r = await call('get', '/analytics/revenue'); // not in rules -> allowed at API level in mock (route-guarded in UI)
  r = await call('patch', '/services/s1', { price: 1 });
  check('S1-03 stylist cannot edit services (403)', !r.ok && r.status === 403, r);
  // lockout
  for (let i = 1; i <= 4; i++) await call('post', '/auth/login', { email: 'reception@lumi.vn', password: 'bad' });
  r = await call('post', '/auth/login', { email: 'reception@lumi.vn', password: 'bad' });
  check('S1-01 5th failure locks 15 min', !r.ok && /15 phút/.test(r.msg), r);
  r = await call('post', '/auth/login', { email: 'reception@lumi.vn', password: 'demo1234' });
  check('S1-01 correct password still refused while locked', !r.ok && /khoá/.test(r.msg), r);
  // admin actions
  await call('post', '/auth/login', { email: 'admin@lumi.vn', password: 'demo1234' });
  r = await call('post', '/users', { fullName: 'Dup', email: 'MINHANH@lumi.vn', role: 'stylist' });
  check('#8 duplicate email rejected, field=email', !r.ok && r.status === 409 && r.field === 'email', r);
  r = await call('patch', '/users/u4', { isActive: false });
  check('#13 cannot deactivate last admin', !r.ok && /quản trị cuối cùng/.test(r.msg), r);
  r = await call('patch', '/users/u4', { role: 'owner' });
  check('#13 cannot demote last admin', !r.ok && /quản trị cuối cùng/.test(r.msg), r);
  r = await call('post', '/users/u2/unlock', {});
  check('unlock clears lock', r.ok && r.data.lockedUntil === null, r);
  r = await call('post', '/users', { fullName: 'Thợ Mới', email: 'thomoi@lumi.vn', role: 'stylist' });
  check('#2 new stylist account auto-creates linked profile', r.ok && !!r.data.stylistId && r.data.mustChangePassword === true, r);
  const newStylistId = r.data.stylistId;
  r = await call('get', '/stylists');
  check('#2 profile appears in Hồ sơ thợ with email', r.ok && r.data.some(s => s.id === newStylistId && s.email === 'thomoi@lumi.vn'), r);
  r = await call('patch', '/users/u-st1', { isActive: false });
  check('#0.3 admin deactivates stylist account', r.ok, r);
  r = await call('get', '/stylists'); check('#0.3 profile deactivated too', r.data.find(s => s.id === 'st1').isActive === false, r);
  r = await call('post', '/auth/login', { email: 'minhanh@lumi.vn', password: 'demo1234' });
  check('#0.3 inactive account cannot log in (403 contact admin)', !r.ok && r.status === 403 && /liên hệ quản trị/.test(r.msg), r);
  // owner flows
  await call('post', '/auth/login', { email: 'owner@lumi.vn', password: 'demo1234' });
  await call('patch', '/stylists/st1', { isActive: true });
  r = await call('post', '/stylists', { fullName: 'Nguyễn Xuân Quỳnh', email: 'xuanquynh@lumi.vn', serviceIds: ['s1', 's2'] });
  check('#4/#7 stylist created with email -> account created', r.ok && r.data.email === 'xuanquynh@lumi.vn', r);
  const qid = r.data.id;
  await call('post', '/auth/login', { email: 'admin@lumi.vn', password: 'demo1234' });
  r = await call('get', '/users', null, { search: 'xuanquynh' });
  check('#7 new stylist visible in Tài khoản nhân sự', r.ok && r.data.items.length === 1 && r.data.items[0].stylistId === qid, r);
  await call('post', '/auth/login', { email: 'owner@lumi.vn', password: 'demo1234' });
  r = await call('patch', '/stylists/st1', { fullName: 'Nguyễn Minh Anh A', phone: '0987000000' });
  await call('post', '/auth/login', { email: 'admin@lumi.vn', password: 'demo1234' });
  r = await call('get', '/users', null, { search: 'minhanh@' });
  check('#6 stylist edit syncs name/phone to account', r.data.items[0].fullName === 'Nguyễn Minh Anh A' && r.data.items[0].phone === '0987000000', r);
  await call('post', '/auth/login', { email: 'owner@lumi.vn', password: 'demo1234' });
  r = await call('post', '/services', { categoryId: 'hair', name: 'Nhuộm tóc thời trang', durationMinutes: 60, price: 500000, stylistIds: ['st1','st2','st3','st4'] });
  const sid = r.data.id;
  r = await call('get', '/stylists');
  check('#11 new service assignment shows in every stylist skill list', ['st1','st2','st3','st4'].every(id => r.data.find(s => s.id === id).serviceIds.includes(sid)), r);
  await call('patch', '/stylists/st2', { serviceIds: ['s1'] });
  r = await call('get', '/services');
  check('#11 reverse sync: removing skill removes stylist from service', !r.data.find(s => s.id === sid).stylistIds.includes('st2') && r.data.find(s => s.id === 's1').stylistIds.includes('st2'), r);
  r = await call('delete', '/services/s1');
  check('#12 cannot delete service with appointments (409)', !r.ok && r.status === 409, r);
  r = await call('delete', '/services/' + sid);
  check('#12 unreferenced service deletable', r.ok, r);
  for (const [d, p, ok] of [[20, 1000, false], [250, 1000, false], [0, 1000, false], [45, 1000, true], [60, 20000001, false], [60, 0, false], [60, 1500.5, false], [60, 20000000, true]]) {
    r = await call('post', '/services', { categoryId: 'hair', name: `T${d}-${p}`, durationMinutes: d, price: p, stylistIds: [] });
    check(`S1-05 duration=${d} price=${p} -> ${ok ? 'accept' : 'reject'}`, r.ok === ok, r);
  }
  r = await call('delete', '/service-categories/hair');
  check('S1-06 category with services cannot be deleted', !r.ok && r.status === 409, r);
  const wh = (await call('get', '/working-hours')).data;
  r = await call('put', '/working-hours', { days: wh.map(d => d.dayOfWeek === 1 ? { ...d, openTime: '08:00', closeTime: '08:45' } : d) });
  check('S1-08 close < open+60 rejected', !r.ok && /60 phút/.test(r.msg), r);
  r = await call('put', '/working-hours', { days: wh.map(d => d.dayOfWeek === 1 ? { ...d, openTime: '08:00', closeTime: '09:00' } : d) });
  check('S1-08 close = open+60 accepted', r.ok, r);
  // Role switcher cannot resurrect an inactive session
  await call('post', '/auth/login', { email: 'admin@lumi.vn', password: 'demo1234' });
  for (const u of ['u-st1','u-st2','u-st3','u-st4']) await call('patch', '/users/' + u, { isActive: false });
  const users = (await call('get', '/users', null, { role: 'stylist', limit: 100 })).data.items;
  for (const u of users) await call('patch', '/users/' + u.id, { isActive: false });
  m.demoRole.set('stylist');
  check('RoleSwitcher -> no active stylist -> no session', m.demoRole.user() === null, m.demoRole.user());
  r = await call('get', '/appointments/my-day', null, { date: '2026-09-26' });
  check('API rejects anonymous calls (401)', !r.ok && r.status === 401, r);
  // change password
  await call('post', '/auth/login', { email: 'admin@lumi.vn', password: 'demo1234' });
  await call('patch', '/users/u-st2', { isActive: true });
  r = await call('post', '/auth/login', { email: 'baongoc@lumi.vn', password: 'demo1234' });
  r = await call('post', '/auth/change-password', { currentPassword: 'nope', newPassword: 'abc12345' });
  check('S1-04 wrong current password rejected', !r.ok && r.field === 'currentPassword', r);
  r = await call('post', '/auth/change-password', { currentPassword: 'demo1234', newPassword: 'abcdefgh' });
  check('S1-04 weak password rejected', !r.ok && r.field === 'newPassword', r);
  r = await call('post', '/auth/change-password', { currentPassword: 'demo1234', newPassword: 'abc12345' });
  check('S1-04 valid change accepted', r.ok, r);
  r = await call('post', '/auth/login', { email: 'baongoc@lumi.vn', password: 'demo1234' });
  check('S1-04 old password no longer works', !r.ok, r);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
