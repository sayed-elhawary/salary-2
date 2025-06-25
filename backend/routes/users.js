import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// إنشاء مستخدم جديد
router.post('/', async (req, res) => {
  try {
    const {
      code,
      fullName,
      email,
      phone,
      password,
      department,
      baseSalary,
      baseBonus,
      bonusPercentage,
      medicalInsurance,
      socialInsurance,
      workDays,
      status,
      createdBy,
    } = req.body;

    // التحقق من وجود كود أو إيميل مكرر
    const existingUser = await User.findOne({ $or: [{ code }, { email: email || null }] });
    if (existingUser) {
      return res.status(400).json({ message: 'الكود أو البريد الإلكتروني مستخدم بالفعل' });
    }

    const user = new User({
      code,
      fullName,
      email,
      phone,
      password,
      department,
      baseSalary,
      baseBonus,
      bonusPercentage,
      medicalInsurance,
      socialInsurance,
      workDays,
      status,
      createdBy,
    });

    await user.save();
    res.status(201).json({ user: { ...user.toObject(), netSalary: user.netSalary } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// جلب بيانات المستخدم الحالي
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'لا يوجد توكن' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ code: decoded.code }).select('-password');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.json({ user: { ...user.toObject(), netSalary: user.netSalary } });
  } catch (err) {
    res.status(401).json({ message: 'التوكن غير صالح' });
  }
});

// تسجيل الدخول
router.post('/login', async (req, res) => {
  try {
    const { code, password } = req.body;
    const user = await User.findOne({ code });
    if (!user) return res.status(401).json({ message: 'كود الموظف غير صحيح' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'الحساب غير نشط' });
    }

    const token = jwt.sign({ code: user.code, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token, user: { ...user.toObject(), netSalary: user.netSalary } });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

export default router;
