import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.error('No token provided in request');
    return res.status(401).json({ message: 'غير مصرح، يرجى تقديم توكن' });
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
      eidBonus,
      penaltiesValue,
      violationsInstallment,
      totalViolationsValue,
    } = req.body;

    if (!code || !fullName || !password || !department || !baseSalary || !bonusPercentage) {
      console.error('Missing required fields:', { code, fullName, password, department, baseSalary, bonusPercentage });
      return res.status(400).json({ message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' });
    }

    const numericFields = {
      baseSalary,
      baseBonus,
      bonusPercentage,
      mealAllowance,
      medicalInsurance,
      socialInsurance,
      workDaysPerWeek,
      totalAnnualLeave,
      eidBonus,
      penaltiesValue,
      violationsInstallment,
      totalViolationsValue,
    };

    for (const [key, value] of Object.entries(numericFields)) {
      if (value !== undefined && (isNaN(value) || value < 0)) {
        console.error(`Invalid ${key}: ${value}`);
        return res.status(400).json({ message: `قيمة ${key} يجب أن تكون رقمًا موجبًا` });
      }
    }

    const existingUser = await User.findOne({ code });
    if (existingUser) {
      console.error(`User with code ${code} already exists`);
      return res.status(400).json({ message: 'الكود مستخدم بالفعل' });
    }

    const user = new User({
      code,
      fullName,
      password,
      department,
      baseSalary: parseFloat(baseSalary) || 0,
      baseBonus: parseFloat(baseBonus) || 0,
      bonusPercentage: parseFloat(bonusPercentage) || 0,
      mealAllowance: parseFloat(mealAllowance) || 500,
      medicalInsurance: parseFloat(medicalInsurance) || 0,
      socialInsurance: parseFloat(socialInsurance) || 0,
      workDaysPerWeek: parseInt(workDaysPerWeek) || 5,
      status: status || 'active',
      createdBy,
      totalAnnualLeave: parseInt(totalAnnualLeave) || 0,
      role: 'user',
      eidBonus: parseFloat(eidBonus) || 0,
      penaltiesValue: parseFloat(penaltiesValue) || 0,
      violationsInstallment: parseFloat(violationsInstallment) || 0,
      totalViolationsValue: parseFloat(totalViolationsValue) || 0,
    });

    await user.save();
    const netSalaryData = await user.netSalary;
    console.log(`User created successfully: ${code}`, {
      violationsInstallment: user.violationsInstallment,
      baseSalary: user.baseSalary,
      netSalary: netSalaryData.netSalary,
    });
    res.status(201).json({ user: { ...user.toObject(), netSalary: netSalaryData.netSalary, employeeName: user.fullName } });
  } catch (err) {
    console.error('Error creating user:', err.message);
    res.status(400).json({ message: 'خطأ في إنشاء المستخدم: ' + err.message });
  }
});

router.put('/:code', authMiddleware, async (req, res) => {
  try {
    console.log('Received update request for user:', req.params.code, 'Data:', req.body);
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
      role,
      eidBonus,
      penaltiesValue,
      violationsInstallment,
      totalViolationsValue,
    } = req.body;

    const user = await User.findOne({ code: req.params.code });
    if (!user) {
      console.error(`User with code ${req.params.code} not found`);
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    if (role && role !== 'user') {
      console.error('Attempt to set role to admin:', role);
      return res.status(403).json({ message: 'لا يمكن تعيين الرول إلى admin من هذه الواجهة' });
    }

    const numericFields = {
      baseSalary,
      baseBonus,
      bonusPercentage,
      mealAllowance,
      medicalInsurance,
      socialInsurance,
      workDaysPerWeek,
      totalAnnualLeave,
      eidBonus,
      penaltiesValue,
      violationsInstallment,
      totalViolationsValue,
    };

    for (const [key, value] of Object.entries(numericFields)) {
      if (value !== undefined && (isNaN(value) || value < 0)) {
        console.error(`Invalid ${key}: ${value}`);
        return res.status(400).json({ message: `قيمة ${key} يجب أن تكون رقمًا موجبًا` });
      }
    }

    user.code = code || user.code;
    user.fullName = fullName || user.fullName;
    user.department = department || user.department;
    user.baseSalary = baseSalary !== undefined ? parseFloat(baseSalary) : user.baseSalary;
    user.baseBonus = baseBonus !== undefined ? parseFloat(baseBonus) : user.baseBonus;
    user.bonusPercentage = bonusPercentage !== undefined ? parseFloat(bonusPercentage) : user.bonusPercentage;
    user.mealAllowance = mealAllowance !== undefined ? parseFloat(mealAllowance) : user.mealAllowance;
    user.medicalInsurance = medicalInsurance !== undefined ? parseFloat(medicalInsurance) : user.medicalInsurance;
    user.socialInsurance = socialInsurance !== undefined ? parseFloat(socialInsurance) : user.socialInsurance;
    user.workDaysPerWeek = workDaysPerWeek !== undefined ? parseInt(workDaysPerWeek) : user.workDaysPerWeek;
    user.status = status || user.status;
    user.createdBy = createdBy || user.createdBy;
    user.totalAnnualLeave = totalAnnualLeave !== undefined ? parseInt(totalAnnualLeave) : user.totalAnnualLeave;
    user.eidBonus = eidBonus !== undefined ? parseFloat(eidBonus) : user.eidBonus;
    user.penaltiesValue = penaltiesValue !== undefined ? parseFloat(penaltiesValue) : user.penaltiesValue;
    user.violationsInstallment = violationsInstallment !== undefined ? parseFloat(violationsInstallment) : user.violationsInstallment;
    user.totalViolationsValue = totalViolationsValue !== undefined ? parseFloat(totalViolationsValue) : user.totalViolationsValue;

    await user.save();
    const netSalaryData = await user.netSalary;
    console.log('Updated user:', {
      code: user.code,
      violationsInstallment: user.violationsInstallment,
      baseSalary: user.baseSalary,
      netSalary: netSalaryData.netSalary,
    });
    res.json({ message: 'تم تحديث المستخدم بنجاح', user: { ...user.toObject(), netSalary: netSalaryData.netSalary, employeeName: user.fullName } });
  } catch (error) {
    console.error('Error updating user:', error.message);
    res.status(500).json({ message: 'خطأ في تحديث المستخدم: ' + error.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.error('No token provided');
      return res.status(401).json({ message: 'لا يوجد توكن' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ code: decoded.code }).select('-password');
    if (!user) {
      console.error(`User with code ${decoded.code} not found`);
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    const netSalaryData = await user.netSalary;
    res.json({ user: { ...user.toObject(), netSalary: netSalaryData.netSalary, employeeName: user.fullName } });
  } catch (err) {
    console.error('Error fetching user:', err.message);
    res.status(401).json({ message: 'التوكن غير صالح' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { code, password } = req.body;
    if (!code || !password) {
      console.error('Missing code or password');
      return res.status(400).json({ message: 'كود الموظف وكلمة المرور مطلوبان' });
    }

    const user = await User.findOne({ code });
    if (!user) {
      console.error(`User with code ${code} not found`);
      return res.status(401).json({ message: 'كود الموظف غير صحيح' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.error('Invalid password for user:', code);
      return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });
    }

    if (user.status !== 'active') {
      console.error(`User ${code} is not active`);
      return res.status(403).json({ message: 'الحساب غير نشط' });
    }

    const token = jwt.sign({ code: user.code, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    const netSalaryData = await user.netSalary;
    res.json({ token, user: { ...user.toObject(), netSalary: netSalaryData.netSalary, employeeName: user.fullName } });
  } catch (err) {
    console.error('Error logging in:', err.message);
    res.status(500).json({ message: 'خطأ في الخادم: ' + err.message });
  }
});

export default router;
