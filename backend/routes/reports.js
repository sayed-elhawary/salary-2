import express from 'express';
import jwt from 'jsonwebtoken';
import Fingerprint from '../models/Fingerprint.js';
import User from '../models/User.js';
import { DateTime } from 'luxon';

const router = express.Router();

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

// دالة لحساب أيام العمل المتوقعة
const calculateExpectedWorkDays = (startDate, endDate, workDaysPerWeek) => {
  let currentDate = DateTime.fromISO(startDate, { zone: 'Africa/Cairo' });
  const end = DateTime.fromISO(endDate, { zone: 'Africa/Cairo' });
  let workDays = 0;
  while (currentDate <= end) {
    const dayOfWeek = currentDate.weekday; // 1=الإثنين, ..., 5=الجمعة, 6=السبت
    if (workDaysPerWeek === 5 && (dayOfWeek === 5 || dayOfWeek === 6)) {
      workDays++; // الجمعة والسبت تُحسبان كأيام عمل
    } else if (workDaysPerWeek === 6 && dayOfWeek === 5) {
      workDays++; // الجمعة فقط تُحسب كيوم عمل
    } else if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      workDays++; // الأيام العادية تُحسب
    }
    currentDate = currentDate.plus({ days: 1 });
  }
  return workDays;
};

// دالة لحساب أيام الإجازة الأسبوعية
const calculateWeeklyLeaveDays = (startDate, endDate, workDaysPerWeek) => {
  let currentDate = DateTime.fromISO(startDate, { zone: 'Africa/Cairo' });
  const end = DateTime.fromISO(endDate, { zone: 'Africa/Cairo' });
  let weeklyLeaveDays = 0;
  while (currentDate <= end) {
    const dayOfWeek = currentDate.weekday;
    if (workDaysPerWeek === 5 && (dayOfWeek === 5 || dayOfWeek === 6)) {
      weeklyLeaveDays++; // الجمعة والسبت إجازة مدفوعة
    } else if (workDaysPerWeek === 6 && dayOfWeek === 5) {
      weeklyLeaveDays++; // الجمعة إجازة مدفوعة
    }
    currentDate = currentDate.plus({ days: 1 });
  }
  return weeklyLeaveDays;
};

router.get('/salary', authMiddleware, async (req, res) => {
  const { startDate, endDate, searchQuery } = req.query;
  try {
    const query = {};
    if (searchQuery) {
      query.$or = [
        { code: searchQuery },
        { fullName: { $regex: searchQuery, $options: 'i' } },
      ];
    }
    const users = await User.find(query);
    const reports = await Promise.all(
      users.map(async (user) => {
        const fingerprints = await Fingerprint.find({
          code: user.code,
          date: { $gte: new Date(startDate), $lte: new Date(endDate) },
        });
        const singleFingerprintDays = fingerprints.filter(
          (f) => f.isSingleFingerprint
        ).length;
        const weeklyLeaveDays = calculateWeeklyLeaveDays(startDate, endDate, user.workDaysPerWeek);
        const expectedWorkDays = calculateExpectedWorkDays(startDate, endDate, user.workDaysPerWeek);
        const attendanceDays = fingerprints.filter((f) => !f.absence).length + weeklyLeaveDays;
        const absentDays = expectedWorkDays - attendanceDays;

        return {
          employeeId: user.code,
          employeeName: user.fullName,
          department: user.department,
          baseSalary: user.baseSalary,
          medicalInsurance: user.medicalInsurance,
          socialInsurance: user.socialInsurance,
          workDaysPerWeek: user.workDaysPerWeek,
          weeklyLeaveDays,
          expectedWorkDays,
          attendanceDays,
          absentDays,
          overtimeHours: fingerprints.reduce((sum, f) => sum + f.overtime, 0),
          lateDays: fingerprints.reduce((sum, f) => sum + f.lateDeduction, 0),
          annualLeaveTaken: user.annualLeaveTaken || 0,
          singleFingerprintDays,
        };
      })
    );
    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error.message);
    res.status(500).json({ message: 'خطأ في جلب التقارير', error: error.message });
  }
});

router.put('/update/:employeeId', authMiddleware, async (req, res) => {
  const { employeeId } = req.params;
  const { absentDays, annualLeaveTaken, singleFingerprintDays, workDaysPerWeek } = req.body;
  try {
    const user = await User.findOne({ code: employeeId });
    if (!user) {
      return res.status(404).json({ message: 'الموظف غير موجود' });
    }
    user.annualLeaveTaken = annualLeaveTaken || user.annualLeaveTaken;
    user.workDaysPerWeek = workDaysPerWeek || user.workDaysPerWeek;
    await user.save();
    res.json({ message: 'تم تحديث البيانات بنجاح' });
  } catch (error) {
    console.error('Error updating report:', error.message);
    res.status(500).json({ message: 'خطأ في تحديث البيانات', error: error.message });
  }
});

export default router;
