import bcrypt from 'bcryptjs';

const plainPassword = 'admin';

const hashedPassword = await bcrypt.hash(plainPassword, 10);

console.log('🔐 كلمة المرور المشفرة:', hashedPassword);

