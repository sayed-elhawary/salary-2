import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';  // لازم تثبّت bcryptjs بـ npm install bcryptjs
import User from '../models/User.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { code, password } = req.body;
  try {
    const user = await User.findOne({ code });
    if (!user) {
      return res.status(401).json({ message: 'كود غير صحيح' });
    }
    // تحقق من كلمة المرور باستخدام bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });
    }
    const token = jwt.sign(
      { code: user.code, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token, role: user.role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

export default router;

