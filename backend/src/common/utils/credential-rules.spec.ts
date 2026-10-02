import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { isValidVnPhone, VN_PHONE_REGEX } from './phone.util';
import { isSafeEmail, isSafePasswordCharset, isStrongPassword } from './password.util';
import { detectImageSignature } from './image-signature.util';
import { ChangePasswordDto, LoginDto } from '../../modules/auth/dto/auth.dto';
import { CreateUserDto } from '../../modules/users/dto/user.dto';

describe('QA-16 — số điện thoại Việt Nam', () => {
  it.each(['0381234567', '0561234567', '0701234567', '0812345678', '0912345678'])('%s hợp lệ', (p) => {
    expect(isValidVnPhone(p)).toBe(true);
  });

  it.each(['0123456789', '0212345678', '0412345678', '0612345678', '091234567', '09123456789', '+84912345678', '1912345678'])(
    '%s bị từ chối',
    (p) => expect(VN_PHONE_REGEX.test(p)).toBe(false),
  );
});

describe('QA-02 — ràng buộc ký tự email / mật khẩu', () => {
  it.each(['admin@salon.vn', 'le.tan+ca1@salon.com.vn', 'a_b-c@mail.co'])('email ASCII %s hợp lệ', (e) => {
    expect(isSafeEmail(e)).toBe(true);
  });

  it.each(['nguyễn@salon.vn', 'admin@sàlon.vn', 'a<b>@salon.vn', "o'neil@salon.vn", 'a b@salon.vn', 'admin@salon'])(
    'email %s bị chặn',
    (e) => expect(isSafeEmail(e)).toBe(false),
  );

  it.each(['Admin@123', 'Pa$$w0rd!', 'Abc12345_-=[]{};:,.?/|~'])('mật khẩu %s hợp lệ', (p) => {
    expect(isSafePasswordCharset(p)).toBe(true);
    expect(isStrongPassword(p)).toBe(true);
  });

  it.each(['Mậtkhẩu123', 'Abc 12345', 'Abc12345<', 'Abc12345"', "Abc12345'", 'Abc12345`', 'Abc12345\\'])(
    'mật khẩu %s bị chặn',
    (p) => expect(isSafePasswordCharset(p)).toBe(false),
  );

  it('LoginDto từ chối email có dấu', async () => {
    const errors = await validate(plainToInstance(LoginDto, { email: 'trần@salon.vn', password: 'Admin@123' }));
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('ChangePasswordDto từ chối mật khẩu mới có dấu dù đủ 8 ký tự gồm chữ và số', async () => {
    const errors = await validate(plainToInstance(ChangePasswordDto, { currentPassword: 'x', newPassword: 'Mậtkhẩu123' }));
    const constraints = errors.find((e) => e.property === 'newPassword')?.constraints ?? {};
    expect(Object.keys(constraints)).toContain('isSafePasswordCharset');
  });

  it('CreateUserDto chặn email có ký tự chèn mã và SĐT đầu số không tồn tại', async () => {
    const errors = await validate(plainToInstance(CreateUserDto, {
      fullName: 'Nhân sự mới', email: '<script>@salon.vn', phone: '0212345678', role: 'receptionist',
    }));
    expect(errors.map((e) => e.property).sort()).toEqual(['email', 'phone']);
  });
});

describe('QA-22 — nhận diện ảnh theo magic bytes', () => {
  it('nhận đúng PNG và JPEG', () => {
    expect(detectImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe('jpeg');
  });

  it('từ chối HTML/EXE đội lốt Content-Type image/png', () => {
    expect(detectImageSignature(new TextEncoder().encode('<html><s'))).toBeNull();
    expect(detectImageSignature(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]))).toBeNull();
    expect(detectImageSignature(new Uint8Array(0))).toBeNull();
  });
});
