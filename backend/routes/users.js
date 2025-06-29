import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// وسيط التحقق من الأدمن
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.error('No token provided in request');
    return res.status(401).json({ message: 'غير مصرح' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      console.error('User is not admin:', decoded);
      return res.status(403).json({ message: 'للأدمن فقط' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Invalid token:', error.message);
    return res.status(401).json({ message: 'توكن غير صالح' });
  }
};

// إنشاء مستخدم جديد
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      code,
      fullName,
      password,
      department,
      baseSalary,
      baseBonus,
      bonusPercentage,
      mealAllowance,
      medicalInsurance,
      socialInsurance,
      workDaysPerWeek,
      status,
      createdBy,
      totalAnnualLeave,
    } = req.body;

    // التحقق من وجود كود مكرر
    const existingUser = await User.findOne({ code });
    if (existingUser) {
      return res.status(400).json({ message: 'الكود مستخدم بالفعل' });
    }

    const user = new User({
      code,
      fullName,
      password,
      department,
      baseSalary,
      baseBonus: baseBonus || 0,
      bonusPercentage: bonusPercentage || 0,
      mealAllowance: mealAllowance || 0,
      medicalInsurance: medicalInsurance || 0,
      socialInsurance: socialInsurance || 0,
      workDaysPerWeek: workDaysPerWeek || 5,
      status: status || 'active',
      createdBy,
      totalAnnualLeave: totalAnnualLeave || 0,
      role: 'user', // تعيين الرول صلبًا كـ "user"
    });

    await user.save();
    res.status(201).json({ user: { ...user.toObject(), netSalary: user.netSalary } });
  } catch (err) {
    console.error('Error creating user:', err.message);
    res.status(400).json({ message: 'خطأ في إنشاء المستخدم: ' + err.message });
  }
});

// تحديث بيانات المستخدم
router.put('/:code', authMiddleware, async (req, res) => {
  try {
    const {
      code,
      fullName,
      department,
      baseSalary,
      baseBonus,
      bonusPercentage,
      mealAllowance,
      medicalInsurance,
      socialInsurance,
      workDaysPerWeek,
      status,
      createdBy,
      totalAnnualLeave,
      role, // قد يتم إرساله، لكن سنتجاهله أو نتحقق منه
    } = req.body;

    const user = await User.findOne({ code: req.params.code });
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    // منع تحديث الرول إلى "admin"
    if (role && role !== 'user') {
      return res.status(403).json({ message: 'لا يمكن تعيين الرول إلى admin من هذه الواجهة' });
    }

    // تحديث الحقول المرسلة فقط
    user.code = code || user.code;
    user.fullName = fullName || user.fullName;
    user.department = department || user.department;
    user.baseSalary = baseSalary !== undefined ? baseSalary : user.baseSalary;
    user.baseBonus = baseBonus !== undefined ? baseBonus : user.baseBonus;
    user.bonusPercentage = bonusPercentage !== undefined ? bonusPercentage : user.bonusPercentage;
    user.mealAllowance = mealAllowance !== undefined ? mealAllowance : user.mealAllowance;
    user.medicalInsurance = medicalInsurance !== undefined ? medicalInsurance : user.medicalInsurance;
    user.socialInsurance = socialInsurance !== undefined ? socialInsurance : user.socialInsurance;
    user.workDaysPerWeek = workDaysPerWeek !== undefined ? workDaysPerWeek : user.workDaysPerWeek;
    user.status = status || user.status;
    user.createdBy = createdBy || user.createdBy;
    user.totalAnnualLeave = totalAnnualLeave !== undefined ? totalAnnualLeave : user.totalAnnualLeave;

    await user.save();
    res.json({ message: 'تم تحديث المستخدم بنجاح', user: { ...user.toObject(), netSalary: user.netSalary } });
  } catch (error) {
    console.error('Error updating user:', error.message);
    res.status(500).json({ message: 'خطأ في تحديث المستخدم: ' + error.message });
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
    console.error('Error fetching user:', err.message);
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
    console.error('Error logging in:', err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

export default router;
