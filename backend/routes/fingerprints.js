import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import Fingerprint from '../models/Fingerprint.js';
import User from '../models/User.js';
import { parseFingerprintFile } from '../utils/fingerprintParser.js';
import { DateTime } from 'luxon';

const router = express.Router();
const upload = multer();

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

const isWeeklyLeaveDay = (date, workDaysPerWeek) => {
  const dayOfWeek = DateTime.fromJSDate(date, { zone: 'Africa/Cairo' }).weekday;
  return (workDaysPerWeek === 5 && (dayOfWeek === 5 || dayOfWeek === 6)) ||
         (workDaysPerWeek === 6 && dayOfWeek === 5);
};

const calculateWeeklyLeaveDays = (startDate, endDate, workDaysPerWeek) => {
  let currentDate = DateTime.fromISO(startDate, { zone: 'Africa/Cairo' });
  const end = DateTime.fromISO(endDate, { zone: 'Africa/Cairo' });
  let weeklyLeaveDays = 0;

  while (currentDate <= end) {
    if (isWeeklyLeaveDay(currentDate.toJSDate(), workDaysPerWeek)) {
      weeklyLeaveDays++;
    }
    currentDate = currentDate.plus({ days: 1 });
  }
  return weeklyLeaveDays;
};

async function handleLateDeduction(report) {
  try {
    const user = await User.findOne({ code: report.code });
    let monthlyLateAllowance = user ? user.monthlyLateAllowance : 120;

    if (report.checkIn && !report.medicalLeave && !report.annualLeave && !isWeeklyLeaveDay(report.date, user ? user.workDaysPerWeek : 5)) {
      const checkInTime = DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' });
      if (!checkInTime.isValid) {
        console.warn(`Invalid checkIn time for report ${report._id} on ${DateTime.fromJSDate(report.date).toISODate()}`);
        report.lateMinutes = 0;
        report.lateDeduction = 0;
        return;
      }

      const expectedStartTime = checkInTime.set({ hour: 8, minute: 30, second: 0, millisecond: 0 });
      const lateLimit = checkInTime.set({ hour: 9, minute: 15, second: 0, millisecond: 0 });
      const lateThreshold = checkInTime.set({ hour: 11, minute: 0, second: 0, millisecond: 0 });

      const diffMs = checkInTime.toMillis() - expectedStartTime.toMillis();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffMinutes > 0) {
        report.lateMinutes = diffMinutes;
        if (checkInTime.toMillis() >= lateThreshold.toMillis()) {
          report.lateDeduction = 0.5;
          console.log(`Late deduction for ${report.code} on ${DateTime.fromJSDate(report.date).toISODate()}: 0.5 (threshold exceeded)`);
        } else if (checkInTime.toMillis() >= lateLimit.toMillis()) {
          if (monthlyLateAllowance >= diffMinutes) {
            monthlyLateAllowance -= diffMinutes;
            report.lateDeduction = 0;
            if (user) {
              user.monthlyLateAllowance = monthlyLateAllowance;
              await user.save();
              console.log(`Deducted ${diffMinutes} minutes from monthlyLateAllowance for ${report.code}. New allowance: ${monthlyLateAllowance}`);
            }
          } else {
            report.lateDeduction = 0.25;
            if (user) {
              user.monthlyLateAllowance = 0;
              await user.save();
              console.log(`Set monthlyLateAllowance to 0 for ${report.code} due to insufficient allowance`);
            }
            console.log(`Late deduction for ${report.code} on ${DateTime.fromJSDate(report.date).toISODate()}: 0.25 (late limit exceeded)`);
          }
        } else {
          report.lateDeduction = 0;
        }
      } else {
        report.lateMinutes = 0;
        report.lateDeduction = 0;
      }
    } else {
      report.lateMinutes = 0;
      report.lateDeduction = 0;
    }
  } catch (error) {
    console.error(`Error in handleLateDeduction for code ${report.code}:`, error.message);
    report.lateMinutes = 0;
    report.lateDeduction = 0;
  }
}

async function handleEarlyLeaveDeduction(report) {
  try {
    if (report.checkOut && !report.medicalLeave && !report.annualLeave && !isWeeklyLeaveDay(report.date, (await User.findOne({ code: report.code }))?.workDaysPerWeek || 5)) {
      const checkOutTime = DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' });
      if (!checkOutTime.isValid) {
        console.warn(`Invalid checkOut time for report ${report._id} on ${DateTime.fromJSDate(report.date).toISODate()}`);
        report.earlyLeaveDeduction = 0;
        return;
      }

      const earlyLeaveThreshold = checkOutTime.set({ hour: 15, minute: 0, second: 0, millisecond: 0 });
      const earlyLeaveLimit = checkOutTime.set({ hour: 16, minute: 0, second: 0, millisecond: 0 });

      if (checkOutTime.toMillis() <= earlyLeaveThreshold.toMillis()) {
        report.earlyLeaveDeduction = 0.5;
        console.log(`Early leave deduction for ${report.code} on ${DateTime.fromJSDate(report.date).toISODate()}: 0.5`);
      } else if (checkOutTime.toMillis() <= earlyLeaveLimit.toMillis()) {
        report.earlyLeaveDeduction = 0.25;
        console.log(`Early leave deduction for ${report.code} on ${DateTime.fromJSDate(report.date).toISODate()}: 0.25`);
      } else {
        report.earlyLeaveDeduction = 0;
      }
    } else {
      report.earlyLeaveDeduction = 0;
    }
  } catch (error) {
    console.error(`Error in handleEarlyLeaveDeduction for code ${report.code}:`, error.message);
    report.earlyLeaveDeduction = 0;
  }
}

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      console.error('No file uploaded in request');
      return res.status(400).json({ message: 'لم يتم رفع ملف' });
    }

    let reports = await parseFingerprintFile(file);
    if (!reports || reports.length === 0) {
      console.error('No valid reports parsed from file');
      return res.status(400).json({ message: 'لا توجد بيانات صالحة في الملف' });
    }

    const finalReports = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const report of reports) {
      try {
        const user = await User.findOne({ code: report.code });
        const date = DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' });
        if (!date.isValid) {
          console.warn(`Skipping report with invalid date for code ${report.code}: ${report.date}`);
          continue;
        }

        const existingReport = await Fingerprint.findOne({
          code: report.code,
          date: {
            $gte: date.startOf('day').toJSDate(),
            $lte: date.endOf('day').toJSDate(),
          },
        });

        if (existingReport) {
          existingReport.checkIn = report.checkIn || existingReport.checkIn;
          existingReport.checkOut = report.checkOut || existingReport.checkOut;
          existingReport.workDaysPerWeek = user ? user.workDaysPerWeek : 5;
          existingReport.absence = report.checkIn || report.checkOut ? false : existingReport.absence;
          existingReport.annualLeave = false;
          existingReport.medicalLeave = false;
          existingReport.medicalLeaveDeduction = 0;
          await existingReport.calculateAttendance();
          await handleLateDeduction(existingReport);
          await handleEarlyLeaveDeduction(existingReport);
          await existingReport.save();
          updatedCount++;
          finalReports.push({
            ...existingReport.toObject(),
            employeeName: user?.fullName || 'غير معروف',
            workDaysPerWeek: existingReport.workDaysPerWeek,
            monthlyLateAllowance: user?.monthlyLateAllowance || 120,
            totalAnnualLeave: user?.totalAnnualLeave || 0,
            weeklyLeaveDays: isWeeklyLeaveDay(existingReport.date, existingReport.workDaysPerWeek) ? 1 : 0,
            medicalLeave: existingReport.medicalLeave ? 'نعم' : 'لا',
            medicalLeaveDeduction: existingReport.medicalLeaveDeduction,
          });
        } else {
          const fingerprint = new Fingerprint({
            ...report,
            workDaysPerWeek: user ? user.workDaysPerWeek : 5,
            annualLeave: false,
            absence: report.checkIn || report.checkOut ? false : true,
            medicalLeave: false,
            medicalLeaveDeduction: 0,
          });
          await fingerprint.calculateAttendance();
          await handleLateDeduction(fingerprint);
          await handleEarlyLeaveDeduction(fingerprint);
          await fingerprint.save();
          createdCount++;
          finalReports.push({
            ...fingerprint.toObject(),
            employeeName: user?.fullName || 'غير معروف',
            workDaysPerWeek: fingerprint.workDaysPerWeek,
            monthlyLateAllowance: user?.monthlyLateAllowance || 120,
            totalAnnualLeave: user?.totalAnnualLeave || 0,
            weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, fingerprint.workDaysPerWeek) ? 1 : 0,
            medicalLeave: fingerprint.medicalLeave ? 'نعم' : 'لا',
            medicalLeaveDeduction: fingerprint.medicalLeaveDeduction,
          });
        }
      } catch (err) {
        console.error(`Error processing report for code ${report.code}:`, err.message);
      }
    }

    console.log(`Upload completed: ${createdCount} records created, ${updatedCount} records updated`);

    const responseReports = finalReports.map(report => ({
      ...report,
      checkIn: report.checkIn && DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      checkOut: report.checkOut && DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      date: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: report.absence ? 'نعم' : 'لا',
      annualLeave: report.annualLeave ? 'نعم' : 'لا',
      medicalLeave: report.medicalLeave ? 'نعم' : 'لا',
      isSingleFingerprint: report.isSingleFingerprint ? 'نعم' : '',
    }));

    res.json({ message: 'تم رفع الملف ومعالجة البيانات بنجاح', reports: responseReports });
  } catch (error) {
    console.error('Error in upload route:', error.message);
    res.status(500).json({ message: 'خطأ في معالجة الملف', error: error.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  const { code, dateFrom, dateTo } = req.query;
  try {
    const query = {};
    if (code) query.code = code;
    let reports = [];

    if (dateFrom && dateTo) {
      query.date = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
      reports = await Fingerprint.find(query).sort({ date: 1 });

      const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
      const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });
      const users = code ? await User.find({ code }) : await User.find();
      const missingReports = [];

      for (let user of users) {
        let currentDate = startDate;
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISODate();
          const existingReport = reports.find(
            r => r.code === user.code && DateTime.fromJSDate(r.date).toISODate() === dateStr
          );
          if (!existingReport) {
            if (isWeeklyLeaveDay(currentDate.toJSDate(), user.workDaysPerWeek)) {
              const weeklyLeaveReport = {
                code: user.code,
                date: currentDate.toJSDate(),
                checkIn: null,
                checkOut: null,
                workHours: 0,
                overtime: 0,
                lateMinutes: 0,
                lateDeduction: 0,
                earlyLeaveDeduction: 0,
                absence: false,
                annualLeave: false,
                medicalLeave: false,
                medicalLeaveDeduction: 0,
                isSingleFingerprint: false,
                workDaysPerWeek: user.workDaysPerWeek,
              };
              const existingWeeklyReport = await Fingerprint.findOne({
                code: user.code,
                date: {
                  $gte: currentDate.startOf('day').toJSDate(),
                  $lte: currentDate.endOf('day').toJSDate(),
                },
              });
              if (!existingWeeklyReport) {
                const fingerprint = new Fingerprint(weeklyLeaveReport);
                await fingerprint.save();
                missingReports.push(fingerprint);
              }
            } else {
              const absenceReport = {
                code: user.code,
                date: currentDate.toJSDate(),
                checkIn: null,
                checkOut: null,
                workHours: 0,
                overtime: 0,
                lateMinutes: 0,
                lateDeduction: 0,
                earlyLeaveDeduction: 1,
                absence: true,
                annualLeave: false,
                medicalLeave: false,
                medicalLeaveDeduction: 0,
                isSingleFingerprint: false,
                workDaysPerWeek: user.workDaysPerWeek,
              };
              const existingAbsenceReport = await Fingerprint.findOne({
                code: user.code,
                date: {
                  $gte: currentDate.startOf('day').toJSDate(),
                  $lte: currentDate.endOf('day').toJSDate(),
                },
              });
              if (!existingAbsenceReport) {
                const fingerprint = new Fingerprint(absenceReport);
                await fingerprint.save();
                missingReports.push(fingerprint);
              }
            }
          }
          currentDate = currentDate.plus({ days: 1 });
        }
      }

      if (code && users.length === 0) {
        let currentDate = startDate;
        const defaultWorkDaysPerWeek = 5;
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISODate();
          const existingReport = reports.find(
            r => r.code === code && DateTime.fromJSDate(r.date).toISODate() === dateStr
          );
          if (!existingReport) {
            if (isWeeklyLeaveDay(currentDate.toJSDate(), defaultWorkDaysPerWeek)) {
              const weeklyLeaveReport = {
                code: code,
                date: currentDate.toJSDate(),
                checkIn: null,
                checkOut: null,
                workHours: 0,
                overtime: 0,
                lateMinutes: 0,
                lateDeduction: 0,
                earlyLeaveDeduction: 0,
                absence: false,
                annualLeave: false,
                medicalLeave: false,
                medicalLeaveDeduction: 0,
                isSingleFingerprint: false,
                workDaysPerWeek: defaultWorkDaysPerWeek,
              };
              const existingWeeklyReport = await Fingerprint.findOne({
                code: code,
                date: {
                  $gte: currentDate.startOf('day').toJSDate(),
                  $lte: currentDate.endOf('day').toJSDate(),
                },
              });
              if (!existingWeeklyReport) {
                const fingerprint = new Fingerprint(weeklyLeaveReport);
                await fingerprint.save();
                missingReports.push(fingerprint);
              }
            } else {
              const absenceReport = {
                code: code,
                date: currentDate.toJSDate(),
                checkIn: null,
                checkOut: null,
                workHours: 0,
                overtime: 0,
                lateMinutes: 0,
                lateDeduction: 0,
                earlyLeaveDeduction: 1,
                absence: true,
                annualLeave: false,
                medicalLeave: false,
                medicalLeaveDeduction: 0,
                isSingleFingerprint: false,
                workDaysPerWeek: defaultWorkDaysPerWeek,
              };
              const existingAbsenceReport = await Fingerprint.findOne({
                code: code,
                date: {
                  $gte: currentDate.startOf('day').toJSDate(),
                  $lte: currentDate.endOf('day').toJSDate(),
                },
              });
              if (!existingAbsenceReport) {
                const fingerprint = new Fingerprint(absenceReport);
                await fingerprint.save();
                missingReports.push(fingerprint);
              }
            }
          }
          currentDate = currentDate.plus({ days: 1 });
        }
      }

      reports = [...reports, ...missingReports].sort((a, b) => new Date(a.date) - new Date(b.date));
    } else {
      reports = await Fingerprint.find(query).sort({ date: 1 });
    }

    const uniqueReports = [];
    const seen = new Set();
    for (const report of reports) {
      const key = `${report.code}-${DateTime.fromJSDate(report.date).toISODate()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueReports.push(report);
      }
    }

    const responseReports = await Promise.all(
      uniqueReports.map(async report => {
        const user = await User.findOne({ code: report.code });
        const workDaysPerWeek = user ? user.workDaysPerWeek : 5;
        const weeklyLeaveDays = isWeeklyLeaveDay(report.date, workDaysPerWeek) ? 1 : 0;
        const annualLeaveDays = report.annualLeave ? 1 : 0;
        const medicalLeaveDays = report.medicalLeave ? 1 : 0;
        return {
          ...report.toObject(),
          employeeName: user ? user.fullName : 'غير معروف',
          workDaysPerWeek,
          weeklyLeaveDays,
          annualLeaveDays,
          medicalLeaveDays,
          totalAnnualLeave: user ? user.totalAnnualLeave : 0,
          monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
          absence: report.absence ? 'نعم' : 'لا',
          annualLeave: report.annualLeave ? 'نعم' : 'لا',
          medicalLeave: report.medicalLeave ? 'نعم' : 'لا',
          isSingleFingerprint: report.isSingleFingerprint ? 'نعم' : '',
          checkIn: report.checkIn && DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).isValid
            ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
            : null,
          checkOut: report.checkOut && DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).isValid
            ? DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
            : null,
          date: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate(),
        };
      })
    );

    const totalWeeklyLeaveDays = dateFrom && dateTo
      ? calculateWeeklyLeaveDays(dateFrom, dateTo, responseReports[0]?.workDaysPerWeek || 5)
      : 0;
    const totalAnnualLeaveDays = responseReports.reduce((acc, report) => acc + (report.annualLeaveDays || 0), 0);
    const totalMedicalLeaveDays = responseReports.reduce((acc, report) => acc + (report.medicalLeaveDays || 0), 0);
    const totalAbsenceDays = responseReports.reduce((acc, report) => acc + (report.absence === 'نعم' ? 1 : 0), 0);

    res.json({ reports: responseReports, totalWeeklyLeaveDays, totalAnnualLeaveDays, totalMedicalLeaveDays, totalAbsenceDays });
  } catch (error) {
    console.error('Error in search route:', error.message);
    res.status(500).json({ message: 'خطأ في البحث', error: error.message });
  }
});

router.get('/salary-report', authMiddleware, async (req, res) => {
  const { code, dateFrom, dateTo } = req.query;
  try {
    const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
    const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });

    if (!startDate.isValid || !endDate.isValid) {
      return res.status(400).json({ message: 'تاريخ البداية أو النهاية غير صالح' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
    }

    const users = code ? await User.find({ code }) : await User.find();
    const salaryReports = [];

    for (const user of users) {
      const query = {
        code: user.code,
        date: { $gte: startDate.toJSDate(), $lte: endDate.toJSDate() },
      };
      const fingerprints = await Fingerprint.find(query).sort({ date: 1 });
      console.log(`Found ${fingerprints.length} fingerprints for user ${user.code}`);

      // إنشاء سجلات الغياب أو الإجازات الأسبوعية إذا لزم الأمر
      const missingReports = [];
      let currentDate = startDate;
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISODate();
        const existingReport = fingerprints.find(
          r => r.code === user.code && DateTime.fromJSDate(r.date).toISODate() === dateStr
        );
        if (!existingReport) {
          if (isWeeklyLeaveDay(currentDate.toJSDate(), user.workDaysPerWeek)) {
            const weeklyLeaveReport = {
              code: user.code,
              date: currentDate.toJSDate(),
              checkIn: null,
              checkOut: null,
              workHours: 0,
              overtime: 0,
              lateMinutes: 0,
              lateDeduction: 0,
              earlyLeaveDeduction: 0,
              absence: false,
              annualLeave: false,
              medicalLeave: false,
              medicalLeaveDeduction: 0,
              isSingleFingerprint: false,
              workDaysPerWeek: user.workDaysPerWeek,
            };
            const existingWeeklyReport = await Fingerprint.findOne({
              code: user.code,
              date: {
                $gte: currentDate.startOf('day').toJSDate(),
                $lte: currentDate.endOf('day').toJSDate(),
              },
            });
            if (!existingWeeklyReport) {
              const fingerprint = new Fingerprint(weeklyLeaveReport);
              await fingerprint.save();
              missingReports.push(fingerprint);
            }
          } else {
            const absenceReport = {
              code: user.code,
              date: currentDate.toJSDate(),
              checkIn: null,
              checkOut: null,
              workHours: 0,
              overtime: 0,
              lateMinutes: 0,
              lateDeduction: 0,
              earlyLeaveDeduction: 1,
              absence: true,
              annualLeave: false,
              medicalLeave: false,
              medicalLeaveDeduction: 0,
              isSingleFingerprint: false,
              workDaysPerWeek: user.workDaysPerWeek,
            };
            const existingAbsenceReport = await Fingerprint.findOne({
              code: user.code,
              date: {
                $gte: currentDate.startOf('day').toJSDate(),
                $lte: currentDate.endOf('day').toJSDate(),
              },
            });
            if (!existingAbsenceReport) {
              const fingerprint = new Fingerprint(absenceReport);
              await fingerprint.save();
              missingReports.push(fingerprint);
            }
          }
        }
        currentDate = currentDate.plus({ days: 1 });
      }

      const allReports = [...fingerprints, ...missingReports].sort((a, b) => new Date(a.date) - new Date(b.date));
      console.log(`Total reports for user ${user.code}: ${allReports.length}`);

      const totals = allReports.reduce(
        (acc, report) => {
          const isWorkDay = !report.absence && !report.annualLeave && !report.medicalLeave && !isWeeklyLeaveDay(report.date, user.workDaysPerWeek);
          acc.totalWorkHours += report.workHours || 0;
          acc.totalWorkDays += isWorkDay ? 1 : 0;
          acc.totalAbsenceDays += report.absence ? 1 : 0;
          acc.lateDeductionDays += report.lateDeduction || 0;
          acc.earlyLeaveDeductionDays += report.earlyLeaveDeduction || 0;
          acc.totalOvertime += report.overtime || 0;
          acc.totalWeeklyLeaveDays += isWeeklyLeaveDay(report.date, user.workDaysPerWeek) ? 1 : 0;
          acc.totalAnnualLeaveDays += report.annualLeave ? 1 : 0;
          acc.totalMedicalLeaveDays += report.medicalLeave ? 1 : 0;
          if (report.lateDeduction > 0) {
            console.log(`Late deduction for ${report.code} on ${DateTime.fromJSDate(report.date).toISODate()}: ${report.lateDeduction}`);
          }
          return acc;
        },
        {
          totalWorkHours: 0,
          totalWorkDays: 0,
          totalAbsenceDays: 0,
          lateDeductionDays: 0,
          earlyLeaveDeductionDays: 0,
          totalOvertime: 0,
          totalWeeklyLeaveDays: 0,
          totalAnnualLeaveDays: 0,
          totalMedicalLeaveDays: 0,
        }
      );

      // تصحيح إجمالي أيام العمل لضمان أن مجموع الأيام = 31
      const totalDays = totals.totalWorkDays + totals.totalAbsenceDays + totals.totalAnnualLeaveDays + totals.totalMedicalLeaveDays + totals.totalWeeklyLeaveDays;
      if (totalDays !== 31) {
        totals.totalWeeklyLeaveDays += 31 - totalDays;
      }

      const dailySalary = user.baseSalary / 30;
      const hourlyRate = dailySalary / 9; // 9 ساعات عمل يومية
      const overtimeValue = (totals.totalOvertime * hourlyRate).toFixed(2);
      const baseMealAllowance = user.mealAllowance;
      const mealAllowance = (baseMealAllowance - (totals.totalAbsenceDays + totals.totalAnnualLeaveDays + totals.totalMedicalLeaveDays) * 50).toFixed(2);
      const bonus = user.baseBonus * (user.bonusPercentage / 100);
      const deductionsValue = ((totals.totalAbsenceDays + totals.lateDeductionDays + totals.earlyLeaveDeductionDays) * dailySalary + user.penaltiesValue + user.violationsInstallment).toFixed(2);

      const salaryReport = {
        code: user.code,
        fullName: user.fullName,
        department: user.department,
        baseSalary: user.baseSalary,
        medicalInsurance: user.medicalInsurance,
        socialInsurance: user.socialInsurance,
        mealAllowance: parseFloat(mealAllowance),
        bonus: bonus.toFixed(2),
        eidBonus: user.eidBonus,
        totalWorkHours: totals.totalWorkHours.toFixed(2),
        totalWorkDays: totals.totalWorkDays,
        totalAbsenceDays: totals.totalAbsenceDays,
        lateDeductionDays: totals.lateDeductionDays.toFixed(2),
        earlyLeaveDeductionDays: totals.earlyLeaveDeductionDays.toFixed(2),
        deductionsValue: parseFloat(deductionsValue),
        totalOvertime: totals.totalOvertime.toFixed(2),
        overtimeValue: parseFloat(overtimeValue),
        totalWeeklyLeaveDays: totals.totalWeeklyLeaveDays,
        totalAnnualLeaveDays: totals.totalAnnualLeaveDays,
        totalMedicalLeaveDays: totals.totalMedicalLeaveDays,
        totalAnnualLeaveYear: user.totalAnnualLeave,
        annualLeaveBalance: user.annualLeaveBalance,
        penaltiesValue: user.penaltiesValue,
        violationsInstallment: user.violationsInstallment,
        totalViolationsValue: user.totalViolationsValue,
        netSalary: (
          user.baseSalary +
          parseFloat(mealAllowance) +
          parseFloat(overtimeValue) +
          bonus +
          user.eidBonus -
          user.medicalInsurance -
          user.socialInsurance -
          parseFloat(deductionsValue)
        ).toFixed(2),
      };

      console.log(`Salary report for ${user.code}:`, {
        lateDeductionDays: salaryReport.lateDeductionDays,
        deductionsValue: salaryReport.deductionsValue,
        netSalary: salaryReport.netSalary,
      });

      salaryReports.push(salaryReport);
    }

    res.json({ salaryReports });
  } catch (error) {
    console.error('Error in salary-report route:', error.message);
    res.status(500).json({ message: 'خطأ في جلب تقرير المرتب الشهري', error: error.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const fingerprint = await Fingerprint.findById(req.params.id);
    if (!fingerprint) {
      console.error(`Fingerprint not found for ID ${req.params.id}`);
      return res.status(404).json({ message: 'السجل غير موجود' });
    }

    const user = await User.findOne({ code: fingerprint.code });
    const workDaysPerWeek = user ? user.workDaysPerWeek : 5;
    const responseReport = {
      ...fingerprint.toObject(),
      employeeName: user ? user.fullName : 'غير معروف',
      workDaysPerWeek,
      monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
      totalAnnualLeave: user ? user.totalAnnualLeave : 0,
      annualLeaveBalance: user ? user.annualLeaveBalance : 21,
      weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, workDaysPerWeek) ? 1 : 0,
      annualLeaveDays: fingerprint.annualLeave ? 1 : 0,
      medicalLeaveDays: fingerprint.medicalLeave ? 1 : 0,
      checkIn: fingerprint.checkIn && DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      checkOut: fingerprint.checkOut && DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: fingerprint.absence ? 'نعم' : 'لا',
      annualLeave: fingerprint.annualLeave ? 'نعم' : 'لا',
      medicalLeave: fingerprint.medicalLeave ? 'نعم' : 'لا',
      isSingleFingerprint: fingerprint.isSingleFingerprint ? 'نعم' : '',
    };

    res.json({ report: responseReport });
  } catch (error) {
    console.error('Error in fetch single report route:', error.message);
    res.status(500).json({ message: 'خطأ في جلب السجل', error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const fingerprint = await Fingerprint.findById(req.params.id);
    if (!fingerprint) {
      console.error(`Fingerprint not found for ID ${req.params.id}`);
      return res.status(404).json({ error: 'السجل غير موجود' });
    }

    const { code, date, checkIn, checkOut, absence, annualLeave, medicalLeave } = req.body;
    const dateDt = DateTime.fromISO(date, { zone: 'Africa/Cairo' });
    if (!dateDt.isValid) {
      return res.status(400).json({ error: 'تاريخ السجل غير صالح' });
    }

    const existingReport = await Fingerprint.findOne({
      code,
      date: {
        $gte: dateDt.startOf('day').toJSDate(),
        $lte: dateDt.endOf('day').toJSDate(),
      },
      _id: { $ne: req.params.id },
    });

    if (existingReport) {
      return res.status(400).json({ error: 'يوجد سجل آخر بنفس الكود والتاريخ' });
    }

    let checkInTime = null;
    let checkOutTime = null;

    if (checkIn) {
      const formats = ['hh:mm:ss a', 'HH:mm:ss', 'hh:mm a', 'HH:mm'];
      for (const format of formats) {
        checkInTime = DateTime.fromFormat(
          `${dateDt.toFormat('yyyy-MM-dd')} ${checkIn}`,
          `yyyy-MM-dd ${format}`,
          { zone: 'Africa/Cairo' }
        );
        if (checkInTime.isValid) break;
      }
      if (!checkInTime.isValid) {
        return res.status(400).json({ error: 'توقيت الحضور غير صالح' });
      }
    }

    if (checkOut) {
      const formats = ['hh:mm:ss a', 'HH:mm:ss', 'hh:mm a', 'HH:mm'];
      for (const format of formats) {
        checkOutTime = DateTime.fromFormat(
          `${dateDt.toFormat('yyyy-MM-dd')} ${checkOut}`,
          `yyyy-MM-dd ${format}`,
          { zone: 'Africa/Cairo' }
        );
        if (checkOutTime.isValid) break;
      }
      if (!checkOutTime.isValid) {
        return res.status(400).json({ error: 'توقيت الانصراف غير صالح' });
      }
    }

    const user = await User.findOne({ code: code || fingerprint.code });
    if (annualLeave && !fingerprint.annualLeave) {
      if (user && user.annualLeaveBalance > 0) {
        user.totalAnnualLeave = (user.totalAnnualLeave || 0) + 1;
        user.annualLeaveBalance -= 1;
        await user.save();
      } else {
        return res.status(400).json({ error: 'رصيد الإجازات السنوية غير كافٍ' });
      }
    } else if (!annualLeave && fingerprint.annualLeave) {
      if (user) {
        user.totalAnnualLeave = Math.max((user.totalAnnualLeave || 0) - 1, 0);
        user.annualLeaveBalance += 1;
        await user.save();
      }
    }

    fingerprint.code = code || fingerprint.code;
    fingerprint.date = dateDt.toJSDate();
    fingerprint.checkIn = checkInTime ? checkInTime.toJSDate() : null;
    fingerprint.checkOut = checkOutTime ? checkOutTime.toJSDate() : null;
    fingerprint.absence = absence !== undefined ? absence : fingerprint.absence;
    fingerprint.annualLeave = annualLeave !== undefined ? annualLeave : fingerprint.annualLeave;
    fingerprint.medicalLeave = medicalLeave !== undefined ? medicalLeave : fingerprint.medicalLeave;

    await fingerprint.calculateAttendance();
    await handleLateDeduction(fingerprint);
    await handleEarlyLeaveDeduction(fingerprint);
    await fingerprint.save();

    const workDaysPerWeek = user ? user.workDaysPerWeek : 5;
    const responseReport = {
      ...fingerprint.toObject(),
      employeeName: user ? user.fullName : 'غير معروف',
      workDaysPerWeek,
      monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
      totalAnnualLeave: user ? user.totalAnnualLeave : 0,
      annualLeaveBalance: user ? user.annualLeaveBalance : 21,
      weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, workDaysPerWeek) ? 1 : 0,
      annualLeaveDays: fingerprint.annualLeave ? 1 : 0,
      medicalLeaveDays: fingerprint.medicalLeave ? 1 : 0,
      checkIn: fingerprint.checkIn && DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      checkOut: fingerprint.checkOut && DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: fingerprint.absence ? 'نعم' : 'لا',
      annualLeave: fingerprint.annualLeave ? 'نعم' : 'لا',
      medicalLeave: fingerprint.medicalLeave ? 'نعم' : 'لا',
      isSingleFingerprint: fingerprint.isSingleFingerprint ? 'نعم' : '',
    };

    res.json({ message: 'تم حفظ التعديلات بنجاح', report: responseReport });
  } catch (error) {
    console.error('Error in update route:', error.message);
    res.status(500).json({ error: 'خطأ في التعديل', details: error.message });
  }
});

router.delete('/all', authMiddleware, async (req, res) => {
  try {
    const result = await Fingerprint.deleteMany({});
    console.log(`Deleted ${result.deletedCount} fingerprint records`);
    res.json({ message: 'تم حذف جميع سجلات البصمات بنجاح', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting all fingerprints:', error.message);
    res.status(500).json({ message: 'خطأ في حذف جميع البصمات', error: error.message });
  }
});

router.post('/mission', authMiddleware, async (req, res) => {
  try {
    const { code, date, checkIn, checkOut, missionType, description } = req.body;
    const dateDt = DateTime.fromISO(date, { zone: 'Africa/Cairo' });
    if (!dateDt.isValid) {
      return res.status(400).json({ error: 'تاريخ المأمورية غير صالح' });
    }

    let checkInTime = null;
    let checkOutTime = null;

    if (checkIn) {
      const formats = ['hh:mm:ss a', 'HH:mm:ss', 'hh:mm a', 'HH:mm'];
      for (const format of formats) {
        checkInTime = DateTime.fromFormat(
          `${dateDt.toFormat('yyyy-MM-dd')} ${checkIn}`,
          `yyyy-MM-dd ${format}`,
          { zone: 'Africa/Cairo' }
        );
        if (checkInTime.isValid) break;
      }
      if (!checkInTime.isValid) {
        return res.status(400).json({ error: 'توقيت الحضور غير صالح' });
      }
    }

    if (checkOut) {
      const formats = ['hh:mm:ss a', 'HH:mm:ss', 'hh:mm a', 'HH:mm'];
      for (const format of formats) {
        checkOutTime = DateTime.fromFormat(
          `${dateDt.toFormat('yyyy-MM-dd')} ${checkOut}`,
          `yyyy-MM-dd ${format}`,
          { zone: 'Africa/Cairo' }
        );
        if (checkOutTime.isValid) break;
      }
      if (!checkOutTime.isValid) {
        return res.status(400).json({ error: 'توقيت الانصراف غير صالح' });
      }
    }

    const existingReport = await Fingerprint.findOne({
      code,
      date: {
        $gte: dateDt.startOf('day').toJSDate(),
        $lte: dateDt.endOf('day').toJSDate(),
      },
    });

    let fingerprint;
    if (existingReport) {
      fingerprint = existingReport;
      fingerprint.checkIn = checkInTime ? checkInTime.toJSDate() : null;
      fingerprint.checkOut = checkOutTime ? checkOutTime.toJSDate() : null;
      fingerprint.absence = false;
      fingerprint.annualLeave = false;
      fingerprint.medicalLeave = false;
      fingerprint.medicalLeaveDeduction = 0;
      fingerprint.workHours = checkInTime && checkOutTime ? 8 : 0;
      fingerprint.overtime = 0;
      fingerprint.lateMinutes = 0;
      fingerprint.lateDeduction = 0;
      fingerprint.earlyLeaveDeduction = 0;
    } else {
      fingerprint = new Fingerprint({
        code,
        date: dateDt.toJSDate(),
        checkIn: checkInTime ? checkInTime.toJSDate() : null,
        checkOut: checkOutTime ? checkOutTime.toJSDate() : null,
        absence: false,
        annualLeave: false,
        medicalLeave: false,
        medicalLeaveDeduction: 0,
        workHours: checkInTime && checkOutTime ? 8 : 0,
        overtime: 0,
        lateMinutes: 0,
        lateDeduction: 0,
        earlyLeaveDeduction: 0,
        isSingleFingerprint: false,
        workDaysPerWeek: (await User.findOne({ code }))?.workDaysPerWeek || 5,
      });
    }

    await fingerprint.calculateAttendance();
    await handleLateDeduction(fingerprint);
    await handleEarlyLeaveDeduction(fingerprint);
    await fingerprint.save();

    const user = await User.findOne({ code });
    const workDaysPerWeek = user ? user.workDaysPerWeek : 5;
    const responseReport = {
      ...fingerprint.toObject(),
      employeeName: user ? user.fullName : 'غير معروف',
      workDaysPerWeek,
      monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
      totalAnnualLeave: user ? user.totalAnnualLeave : 0,
      weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, workDaysPerWeek) ? 1 : 0,
      annualLeaveDays: fingerprint.annualLeave ? 1 : 0,
      medicalLeaveDays: fingerprint.medicalLeave ? 1 : 0,
      checkIn: fingerprint.checkIn && DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      checkOut: fingerprint.checkOut && DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: fingerprint.absence ? 'نعم' : 'لا',
      annualLeave: fingerprint.annualLeave ? 'نعم' : 'لا',
      medicalLeave: fingerprint.medicalLeave ? 'نعم' : 'لا',
      isSingleFingerprint: fingerprint.isSingleFingerprint ? 'نعم' : '',
      missionType,
      description,
    };

    res.json({ message: 'تم إنشاء/تحديث المأمورية بنجاح', report: responseReport });
  } catch (error) {
    console.error('Error in mission route:', error.message);
    res.status(500).json({ error: 'خطأ في إنشاء/تحديث المأمورية', details: error.message });
  }
});

router.post('/medical-leave', authMiddleware, async (req, res) => {
  try {
    const { code, dateFrom, dateTo } = req.body;
    const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
    const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });

    if (!startDate.isValid || !endDate.isValid) {
      return res.status(400).json({ error: 'تاريخ البداية أو النهاية غير صالح' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
    }

    const user = await User.findOne({ code });
    const workDaysPerWeek = user ? user.workDaysPerWeek : 5;
    const reports = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISODate();
      const isWeeklyLeave = isWeeklyLeaveDay(currentDate.toJSDate(), workDaysPerWeek);

      if (!isWeeklyLeave) {
        const existingReport = await Fingerprint.findOne({
          code,
          date: {
            $gte: currentDate.startOf('day').toJSDate(),
            $lte: currentDate.endOf('day').toJSDate(),
          },
        });

        let fingerprint;
        if (existingReport) {
          fingerprint = existingReport;
          fingerprint.checkIn = null;
          fingerprint.checkOut = null;
          fingerprint.workHours = 0;
          fingerprint.overtime = 0;
          fingerprint.lateMinutes = 0;
          fingerprint.lateDeduction = 0;
          fingerprint.earlyLeaveDeduction = 0;
          fingerprint.absence = false;
          fingerprint.annualLeave = false;
          fingerprint.medicalLeave = true;
          fingerprint.medicalLeaveDeduction = 0;
        } else {
          fingerprint = new Fingerprint({
            code,
            date: currentDate.toJSDate(),
            checkIn: null,
            checkOut: null,
            workHours: 0,
            overtime: 0,
            lateMinutes: 0,
            lateDeduction: 0,
            earlyLeaveDeduction: 0,
            absence: false,
            annualLeave: false,
            medicalLeave: true,
            medicalLeaveDeduction: 0,
            isSingleFingerprint: false,
            workDaysPerWeek,
          });
        }

        await fingerprint.calculateAttendance();
        await fingerprint.save();
        reports.push(fingerprint);
      }
      currentDate = currentDate.plus({ days: 1 });
    }

    const responseReports = await Promise.all(
      reports.map(async report => {
        const user = await User.findOne({ code: report.code });
        const workDaysPerWeek = user ? user.workDaysPerWeek : 5;
        return {
          ...report.toObject(),
          employeeName: user ? user.fullName : 'غير معروف',
          workDaysPerWeek,
          monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
          totalAnnualLeave: user ? user.totalAnnualLeave : 0,
          weeklyLeaveDays: isWeeklyLeaveDay(report.date, workDaysPerWeek) ? 1 : 0,
          annualLeaveDays: report.annualLeave ? 1 : 0,
          medicalLeaveDays: report.medicalLeave ? 1 : 0,
          checkIn: report.checkIn && DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).isValid
            ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
            : null,
          checkOut: report.checkOut && DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).isValid
            ? DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
            : null,
          date: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate(),
          absence: report.absence ? 'نعم' : 'لا',
          annualLeave: report.annualLeave ? 'نعم' : 'لا',
          medicalLeave: report.medicalLeave ? 'نعم' : 'لا',
          isSingleFingerprint: report.isSingleFingerprint ? 'نعم' : '',
        };
      })
    );

    res.json({ message: 'تم إنشاء الإجازة الطبية بنجاح', reports: responseReports });
  } catch (error) {
    console.error('Error in medical leave route:', error.message);
    res.status(500).json({ error: 'خطأ في إنشاء الإجازة الطبية', details: error.message });
  }
});

export default router;
