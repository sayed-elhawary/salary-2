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

    if (report.annualLeave || report.medicalLeave || report.officialLeave || report.leaveCompensation || isWeeklyLeaveDay(report.date, user ? user.workDaysPerWeek : 6)) {
      report.lateMinutes = 0;
      report.lateDeduction = 0;
      return;
    }

    if (report.checkIn) {
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
          report.lateMinutes = 0;
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
    const user = await User.findOne({ code: report.code });
    if (report.annualLeave || report.medicalLeave || report.officialLeave || report.leaveCompensation || isWeeklyLeaveDay(report.date, user ? user.workDaysPerWeek : 6)) {
      report.earlyLeaveDeduction = 0;
      return;
    }

    if (report.checkOut) {
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
      report.earlyLeaveDeduction = report.absence ? 1 : 0;
    }
  } catch (error) {
    console.error(`Error in handleEarlyLeaveDeduction for code ${report.code}:`, error.message);
    report.earlyLeaveDeduction = 0;
  }
}

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, date, checkIn, checkOut, absence, annualLeave, medicalLeave, officialLeave, leaveCompensation } = req.body;

    const dateDt = DateTime.fromISO(date, { zone: 'Africa/Cairo' });
    if (!dateDt.isValid) {
      console.error('Invalid date format:', date);
      return res.status(400).json({ error: 'تاريخ السجل غير صالح' });
    }

    if ([absence, annualLeave, medicalLeave, officialLeave, leaveCompensation].filter(Boolean).length > 1) {
      console.error('Multiple status flags set for code:', code, { absence, annualLeave, medicalLeave, officialLeave, leaveCompensation });
      return res.status(400).json({ error: 'لا يمكن تحديد أكثر من حالة واحدة (غياب، إجازة سنوية، إجازة طبية، إجازة رسمية، بدل إجازة)' });
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
      console.log(`Updating existing report for code ${code} on ${dateDt.toISODate()}`);
      fingerprint = existingReport;
      fingerprint.checkIn = checkIn ? DateTime.fromISO(checkIn, { zone: 'Africa/Cairo' }).toJSDate() : fingerprint.checkIn;
      fingerprint.checkOut = checkOut ? DateTime.fromISO(checkOut, { zone: 'Africa/Cairo' }).toJSDate() : fingerprint.checkOut;
      fingerprint.absence = absence !== undefined ? absence : fingerprint.absence;
      fingerprint.annualLeave = annualLeave !== undefined ? annualLeave : fingerprint.annualLeave;
      fingerprint.medicalLeave = medicalLeave !== undefined ? medicalLeave : fingerprint.medicalLeave;
      fingerprint.officialLeave = officialLeave !== undefined ? officialLeave : fingerprint.officialLeave;
      fingerprint.leaveCompensation = leaveCompensation !== undefined ? leaveCompensation : fingerprint.leaveCompensation;
    } else {
      const user = await User.findOne({ code });
      if (!user) {
        console.error(`User not found for code ${code}`);
        return res.status(404).json({ error: 'لم يتم العثور على المستخدم' });
      }
      fingerprint = new Fingerprint({
        code,
        date: dateDt.toJSDate(),
        checkIn: checkIn ? DateTime.fromISO(checkIn, { zone: 'Africa/Cairo' }).toJSDate() : null,
        checkOut: checkOut ? DateTime.fromISO(checkOut, { zone: 'Africa/Cairo' }).toJSDate() : null,
        absence: absence || false,
        annualLeave: annualLeave || false,
        medicalLeave: medicalLeave || false,
        officialLeave: officialLeave || false,
        leaveCompensation: leaveCompensation || false,
        workDaysPerWeek: user.workDaysPerWeek || 6,
        employeeName: user.fullName || 'غير معروف',
        monthlyLateAllowance: user.monthlyLateAllowance || 120,
        totalAnnualLeave: user.totalAnnualLeave || 0,
        annualLeaveBalance: user.annualLeaveBalance || 21,
      });
    }

    const user = await User.findOne({ code });
    if (!user) {
      console.error(`User not found for code ${code}`);
      return res.status(404).json({ error: 'لم يتم العثور على المستخدم' });
    }

    if (fingerprint.annualLeave) {
      fingerprint.checkIn = DateTime.fromObject({ hour: 8, minute: 30 }, { zone: 'Africa/Cairo' }).toJSDate();
      fingerprint.checkOut = DateTime.fromObject({ hour: 17, minute: 30 }, { zone: 'Africa/Cairo' }).toJSDate();
      fingerprint.workHours = 8;
      fingerprint.lateMinutes = 0;
      fingerprint.lateDeduction = 0;
      fingerprint.earlyLeaveDeduction = 0;
      fingerprint.overtime = 0;
      fingerprint.absence = false;
      fingerprint.medicalLeave = false;
      fingerprint.officialLeave = false;
      fingerprint.leaveCompensation = false;
      fingerprint.medicalLeaveDeduction = 0;
      if (!existingReport && annualLeave) {
        user.totalAnnualLeave = (user.totalAnnualLeave || 0) + 1;
        user.annualLeaveBalance = Math.max((user.annualLeaveBalance || 21) - 1, 0);
        await user.save();
        console.log(`Updated user ${user.code}: totalAnnualLeave=${user.totalAnnualLeave}, annualLeaveBalance=${user.annualLeaveBalance}`);
      }
    } else if (!annualLeave && fingerprint.annualLeave) {
      user.totalAnnualLeave = Math.max((user.totalAnnualLeave || 0) - 1, 0);
      user.annualLeaveBalance = (user.annualLeaveBalance || 21) + 1;
      await user.save();
      console.log(`Reverted annual leave for ${user.code}: totalAnnualLeave=${user.totalAnnualLeave}, annualLeaveBalance=${user.annualLeaveBalance}`);
    } else if (fingerprint.medicalLeave) {
      fingerprint.checkIn = null;
      fingerprint.checkOut = null;
      fingerprint.workHours = 0;
      fingerprint.lateMinutes = 0;
      fingerprint.lateDeduction = 0;
      fingerprint.earlyLeaveDeduction = 0;
      fingerprint.overtime = 0;
      fingerprint.absence = false;
      fingerprint.annualLeave = false;
      fingerprint.officialLeave = false;
      fingerprint.leaveCompensation = false;
      fingerprint.medicalLeaveDeduction = 0.25;
    } else if (fingerprint.officialLeave) {
      fingerprint.checkIn = null;
      fingerprint.checkOut = null;
      fingerprint.workHours = 0;
      fingerprint.lateMinutes = 0;
      fingerprint.lateDeduction = 0;
      fingerprint.earlyLeaveDeduction = 0;
      fingerprint.overtime = 0;
      fingerprint.absence = false;
      fingerprint.annualLeave = false;
      fingerprint.medicalLeave = false;
      fingerprint.leaveCompensation = false;
      fingerprint.medicalLeaveDeduction = 0;
    } else if (fingerprint.leaveCompensation) {
      fingerprint.checkIn = null;
      fingerprint.checkOut = null;
      fingerprint.workHours = 0;
      fingerprint.lateMinutes = 0;
      fingerprint.lateDeduction = 0;
      fingerprint.earlyLeaveDeduction = 0;
      fingerprint.overtime = 0;
      fingerprint.absence = false;
      fingerprint.annualLeave = false;
      fingerprint.medicalLeave = false;
      fingerprint.officialLeave = false;
      fingerprint.medicalLeaveDeduction = 0;
      if (!existingReport && leaveCompensation) {
        user.totalAnnualLeave = (user.totalAnnualLeave || 0) + 1;
        user.annualLeaveBalance = Math.max((user.annualLeaveBalance || 21) - 1, 0);
        await user.save();
        console.log(`Updated user ${user.code} for leave compensation: totalAnnualLeave=${user.totalAnnualLeave}, annualLeaveBalance=${user.annualLeaveBalance}`);
      }
    } else {
      await fingerprint.calculateAttendance();
      await handleLateDeduction(fingerprint);
      await handleEarlyLeaveDeduction(fingerprint);
    }

    fingerprint.employeeName = user.fullName || 'غير معروف';
    fingerprint.monthlyLateAllowance = user.monthlyLateAllowance || 120;
    fingerprint.totalAnnualLeave = user.totalAnnualLeave || 0;
    fingerprint.annualLeaveBalance = user.annualLeaveBalance || 21;

    try {
      await fingerprint.save();
      console.log(`Saved fingerprint for code ${fingerprint.code} on ${dateDt.toISODate()}`);
    } catch (saveError) {
      console.error(`Failed to save fingerprint for code ${fingerprint.code}:`, saveError.message);
      return res.status(500).json({ error: 'خطأ في حفظ السجل', details: saveError.message });
    }

    const responseReport = {
      ...fingerprint.toObject(),
      employeeName: user.fullName || 'غير معروف',
      workDaysPerWeek: user.workDaysPerWeek || 6,
      monthlyLateAllowance: user.monthlyLateAllowance || 120,
      totalAnnualLeave: user.totalAnnualLeave || 0,
      annualLeaveBalance: user.annualLeaveBalance || 21,
      weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, user.workDaysPerWeek) ? 1 : 0,
      annualLeaveDays: fingerprint.annualLeave ? 1 : 0,
      medicalLeaveDays: fingerprint.medicalLeave ? 1 : 0,
      officialLeaveDays: fingerprint.officialLeave ? 1 : 0,
      leaveCompensationDays: fingerprint.leaveCompensation ? 1 : 0,
      checkIn: fingerprint.checkIn ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
      checkOut: fingerprint.checkOut ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
      date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: fingerprint.absence ? 'نعم' : 'لا',
      annualLeave: fingerprint.annualLeave ? 'نعم' : 'لا',
      medicalLeave: fingerprint.medicalLeave ? 'نعم' : 'لا',
      officialLeave: fingerprint.officialLeave ? 'نعم' : 'لا',
      leaveCompensation: fingerprint.leaveCompensation ? 'نعم' : 'لا',
      isSingleFingerprint: fingerprint.isSingleFingerprint ? 'نعم' : '',
    };

    res.status(existingReport ? 200 : 201).json({
      message: existingReport ? 'تم تحديث السجل بنجاح' : 'تم إنشاء السجل بنجاح',
      report: responseReport,
    });
  } catch (err) {
    console.error('Error creating fingerprint:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'خطأ في إنشاء/تحديث السجل', details: err.message });
  }
});

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
        if (!user) {
          console.warn(`Skipping report for non-existent user code ${report.code}`);
          continue;
        }

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

        let fingerprint;
        if (existingReport) {
          console.log(`Updating existing report for code ${report.code} on ${date.toISODate()}`);
          fingerprint = existingReport;
          fingerprint.checkIn = report.checkIn || existingReport.checkIn;
          fingerprint.checkOut = report.checkOut || existingReport.checkOut;
          fingerprint.workDaysPerWeek = user.workDaysPerWeek || 6;
          fingerprint.employeeName = user.fullName || 'غير معروف';
          fingerprint.monthlyLateAllowance = user.monthlyLateAllowance || 120;
          fingerprint.totalAnnualLeave = user.totalAnnualLeave || 0;
          fingerprint.annualLeaveBalance = user.annualLeaveBalance || 21;
          fingerprint.annualLeave = false;
          fingerprint.medicalLeave = false;
          fingerprint.officialLeave = false;
          fingerprint.leaveCompensation = false;
          fingerprint.medicalLeaveDeduction = 0;
          await fingerprint.calculateAttendance();
          await handleLateDeduction(fingerprint);
          await handleEarlyLeaveDeduction(fingerprint);
          await fingerprint.save();
          updatedCount++;
          console.log(`Updated fingerprint for code ${fingerprint.code} on ${date.toISODate()}`);
        } else {
          fingerprint = new Fingerprint({
            ...report,
            workDaysPerWeek: user.workDaysPerWeek || 6,
            employeeName: user.fullName || 'غير معروف',
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            totalAnnualLeave: user.totalAnnualLeave || 0,
            annualLeaveBalance: user.annualLeaveBalance || 21,
            annualLeave: false,
            medicalLeave: false,
            officialLeave: false,
            leaveCompensation: false,
            medicalLeaveDeduction: 0,
          });
          await fingerprint.calculateAttendance();
          await handleLateDeduction(fingerprint);
          await handleEarlyLeaveDeduction(fingerprint);
          await fingerprint.save();
          createdCount++;
          console.log(`Created fingerprint for code ${fingerprint.code} on ${date.toISODate()}`);
        }

        finalReports.push({
          ...fingerprint.toObject(),
          employeeName: user.fullName || 'غير معروف',
          workDaysPerWeek: fingerprint.workDaysPerWeek,
          monthlyLateAllowance: user.monthlyLateAllowance || 120,
          totalAnnualLeave: user.totalAnnualLeave || 0,
          annualLeaveBalance: user.annualLeaveBalance || 21,
          weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, fingerprint.workDaysPerWeek) ? 1 : 0,
          medicalLeaveDays: fingerprint.medicalLeave ? 1 : 0,
          officialLeaveDays: fingerprint.officialLeave ? 1 : 0,
          leaveCompensationDays: fingerprint.leaveCompensation ? 1 : 0,
          annualLeave: fingerprint.annualLeave ? 'نعم' : 'لا',
          medicalLeave: fingerprint.medicalLeave ? 'نعم' : 'لا',
          officialLeave: fingerprint.officialLeave ? 'نعم' : 'لا',
          leaveCompensation: fingerprint.leaveCompensation ? 'نعم' : 'لا',
          absence: fingerprint.absence ? 'نعم' : 'لا',
          isSingleFingerprint: fingerprint.isSingleFingerprint ? 'نعم' : '',
          checkIn: fingerprint.checkIn ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          checkOut: fingerprint.checkOut ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
        });
      } catch (err) {
        console.error(`Error processing report for code ${report.code}:`, err.message);
      }
    }

    console.log(`Upload completed: ${createdCount} records created, ${updatedCount} records updated`);
    res.json({ message: 'تم رفع الملف ومعالجة البيانات بنجاح', reports: finalReports });
  } catch (error) {
    console.error('Error in upload route:', error.message);
    res.status(500).json({ message: 'خطأ في معالجة الملف', error: error.message });
  }
});

// التوقف هنا عند حوالي 900 سطر للجزء الأو
router.get('/', authMiddleware, async (req, res) => {
  const { code, dateFrom, dateTo } = req.query;
  try {
    const query = {};
    if (code) query.code = code;
    let reports = [];

    if (dateFrom && dateTo) {
      const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
      const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });

      if (!startDate.isValid || !endDate.isValid) {
        console.error('Invalid date range:', { dateFrom, dateTo });
        return res.status(400).json({ message: 'تاريخ البداية أو النهاية غير صالح' });
      }

      query.date = { $gte: startDate.toJSDate(), $lte: endDate.toJSDate() };
      reports = await Fingerprint.find(query).sort({ date: 1 });

      const users = code ? await User.find({ code }) : await User.find();
      if (code && users.length === 0) {
        return res.status(404).json({ message: `لا يوجد مستخدم بالكود ${code}` });
      }

      const missingReports = [];

      for (let user of users) {
        let currentDate = startDate;
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISODate();
          const existingReport = reports.find(
            r => r.code === user.code && DateTime.fromJSDate(r.date).toISODate() === dateStr
          );

          if (!existingReport) {
            const workDaysPerWeek = user.workDaysPerWeek || 6;
            const isWeekly = isWeeklyLeaveDay(currentDate.toJSDate(), workDaysPerWeek);
            let reportData;

            if (isWeekly) {
              reportData = {
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
                officialLeave: false,
                leaveCompensation: false,
                medicalLeaveDeduction: 0,
                isSingleFingerprint: false,
                workDaysPerWeek,
                employeeName: user.fullName || 'غير معروف',
                monthlyLateAllowance: user.monthlyLateAllowance || 120,
                totalAnnualLeave: user.totalAnnualLeave || 0,
                annualLeaveBalance: user.annualLeaveBalance || 21,
              };
            } else {
              reportData = {
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
                officialLeave: false,
                leaveCompensation: false,
                medicalLeaveDeduction: 0,
                isSingleFingerprint: false,
                workDaysPerWeek,
                employeeName: user.fullName || 'غير معروف',
                monthlyLateAllowance: user.monthlyLateAllowance || 120,
                totalAnnualLeave: user.totalAnnualLeave || 0,
                annualLeaveBalance: user.annualLeaveBalance || 21,
              };
            }

            const existingReportInDB = await Fingerprint.findOne({
              code: user.code,
              date: {
                $gte: currentDate.startOf('day').toJSDate(),
                $lte: currentDate.endOf('day').toJSDate(),
              },
            });

            if (!existingReportInDB) {
              console.log(`Creating report for ${user.code} on ${dateStr} (Weekly: ${isWeekly})`);
              const fingerprint = new Fingerprint(reportData);
              await fingerprint.calculateAttendance();
              await handleLateDeduction(fingerprint);
              await handleEarlyLeaveDeduction(fingerprint);
              await fingerprint.save();
              missingReports.push(fingerprint);
            }
          } else {
            existingReport.employeeName = user.fullName || 'غير معروف';
            existingReport.monthlyLateAllowance = user.monthlyLateAllowance || 120;
            existingReport.totalAnnualLeave = user.totalAnnualLeave || 0;
            existingReport.annualLeaveBalance = user.annualLeaveBalance || 21;
            await existingReport.calculateAttendance();
            await handleLateDeduction(existingReport);
            await handleEarlyLeaveDeduction(existingReport);
            await existingReport.save();
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
        const workDaysPerWeek = user ? user.workDaysPerWeek : 6;
        return {
          ...report.toObject(),
          employeeName: user ? user.fullName : 'غير معروف',
          workDaysPerWeek,
          monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
          totalAnnualLeave: user ? user.totalAnnualLeave : 0,
          annualLeaveBalance: user ? user.annualLeaveBalance : 21,
          weeklyLeaveDays: isWeeklyLeaveDay(report.date, workDaysPerWeek) ? 1 : 0,
          annualLeaveDays: report.annualLeave ? 1 : 0,
          medicalLeaveDays: report.medicalLeave ? 1 : 0,
          officialLeaveDays: report.officialLeave ? 1 : 0,
          leaveCompensationDays: report.leaveCompensation ? 1 : 0,
          checkIn: report.checkIn ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          checkOut: report.checkOut ? DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          date: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate(),
          absence: report.absence ? 'نعم' : 'لا',
          annualLeave: report.annualLeave ? 'نعم' : 'لا',
          medicalLeave: report.medicalLeave ? 'نعم' : 'لا',
          officialLeave: report.officialLeave ? 'نعم' : 'لا',
          leaveCompensation: report.leaveCompensation ? 'نعم' : 'لا',
          isSingleFingerprint: report.isSingleFingerprint ? 'نعم' : '',
        };
      })
    );

    const totalWeeklyLeaveDays = dateFrom && dateTo
      ? calculateWeeklyLeaveDays(dateFrom, dateTo, responseReports[0]?.workDaysPerWeek || 6)
      : 0;
    const totalAnnualLeaveDays = responseReports.reduce((acc, report) => acc + (report.annualLeaveDays || 0), 0);
    const totalMedicalLeaveDays = responseReports.reduce((acc, report) => acc + (report.medicalLeaveDays || 0), 0);
    const totalOfficialLeaveDays = responseReports.reduce((acc, report) => acc + (report.officialLeaveDays || 0), 0);
    const totalLeaveCompensationDays = responseReports.reduce((acc, report) => acc + (report.leaveCompensationDays || 0), 0);
    const totalAbsenceDays = responseReports.reduce((acc, report) => acc + (report.absence === 'نعم' ? 1 : 0), 0);
    const totalLateDays = responseReports.reduce((acc, report) => acc + (report.lateDeduction > 0 ? 1 : 0), 0);

    res.json({
      reports: responseReports,
      totalWeeklyLeaveDays,
      totalAnnualLeaveDays,
      totalMedicalLeaveDays,
      totalOfficialLeaveDays,
      totalLeaveCompensationDays,
      totalAbsenceDays,
      totalLateDays,
    });
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
    if (code && users.length === 0) {
      return res.status(404).json({ message: `لا يوجد مستخدم بالكود ${code}` });
    }

    const salaryReports = [];

    for (const user of users) {
      const query = {
        code: user.code,
        date: { $gte: startDate.toJSDate(), $lte: endDate.toJSDate() },
      };
      const fingerprints = await Fingerprint.find(query).sort({ date: 1 });

      const missingReports = [];
      let currentDate = startDate;
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISODate();
        const existingReport = fingerprints.find(
          r => r.code === user.code && DateTime.fromJSDate(r.date).toISODate() === dateStr
        );
        if (!existingReport) {
          const workDaysPerWeek = user.workDaysPerWeek || 6;
          if (isWeeklyLeaveDay(currentDate.toJSDate(), workDaysPerWeek)) {
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
              officialLeave: false,
              leaveCompensation: false,
              medicalLeaveDeduction: 0,
              isSingleFingerprint: false,
              workDaysPerWeek,
              employeeName: user.fullName || 'غير معروف',
              monthlyLateAllowance: user.monthlyLateAllowance || 120,
              totalAnnualLeave: user.totalAnnualLeave || 0,
              annualLeaveBalance: user.annualLeaveBalance || 21,
            };
            const existingWeeklyReport = await Fingerprint.findOne({
              code: user.code,
              date: {
                $gte: currentDate.startOf('day').toJSDate(),
                $lte: currentDate.endOf('day').toJSDate(),
              },
            });
            if (!existingWeeklyReport) {
              console.log(`Creating weekly leave report for ${user.code} on ${dateStr}`);
              const fingerprint = new Fingerprint(weeklyLeaveReport);
              await fingerprint.calculateAttendance();
              await fingerprint.save();
              missingReports.push(fingerprint);
            }
          } else {
            const existingAbsenceReport = await Fingerprint.findOne({
              code: user.code,
              date: {
                $gte: currentDate.startOf('day').toJSDate(),
                $lte: currentDate.endOf('day').toJSDate(),
              },
            });
            if (!existingAbsenceReport) {
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
                officialLeave: false,
                leaveCompensation: false,
                medicalLeaveDeduction: 0,
                isSingleFingerprint: false,
                workDaysPerWeek,
                employeeName: user.fullName || 'غير معروف',
                monthlyLateAllowance: user.monthlyLateAllowance || 120,
                totalAnnualLeave: user.totalAnnualLeave || 0,
                annualLeaveBalance: user.annualLeaveBalance || 21,
              };
              console.log(`Creating absence report for ${user.code} on ${dateStr}`);
              const fingerprint = new Fingerprint(absenceReport);
              await fingerprint.calculateAttendance();
              await fingerprint.save();
              missingReports.push(fingerprint);
            }
          }
        } else {
          existingReport.employeeName = user.fullName || 'غير معروف';
          existingReport.monthlyLateAllowance = user.monthlyLateAllowance || 120;
          existingReport.totalAnnualLeave = user.totalAnnualLeave || 0;
          existingReport.annualLeaveBalance = user.annualLeaveBalance || 21;
          await existingReport.calculateAttendance();
          await handleLateDeduction(existingReport);
          await handleEarlyLeaveDeduction(existingReport);
          await existingReport.save();
        }
        currentDate = currentDate.plus({ days: 1 });
      }

      const allReports = [...fingerprints, ...missingReports].sort((a, b) => new Date(a.date) - new Date(b.date));

      const totals = allReports.reduce(
        (acc, report) => {
          const isWorkDay = !report.absence && !report.annualLeave && !report.medicalLeave && !report.officialLeave && !report.leaveCompensation && !isWeeklyLeaveDay(report.date, user.workDaysPerWeek);
          acc.totalWorkHours += report.workHours || 0;
          acc.totalWorkDays += isWorkDay ? 1 : 0;
          acc.totalAbsenceDays += report.absence ? 1 : 0;
          acc.totalLateDays += report.lateDeduction > 0 ? 1 : 0;
          acc.lateDeductionDays += report.lateDeduction || 0;
          acc.earlyLeaveDeductionDays += report.earlyLeaveDeduction || 0;
          acc.medicalLeaveDeductionDays += report.medicalLeaveDeduction || 0;
          acc.totalOvertime += report.overtime || 0;
          acc.totalWeeklyLeaveDays += isWeeklyLeaveDay(report.date, user.workDaysPerWeek) ? 1 : 0;
          acc.totalAnnualLeaveDays += report.annualLeave ? 1 : 0;
          acc.totalMedicalLeaveDays += report.medicalLeave ? 1 : 0;
          acc.totalOfficialLeaveDays += report.officialLeave ? 1 : 0;
          acc.totalLeaveCompensationDays += report.leaveCompensation ? 1 : 0;
          return acc;
        },
        {
          totalWorkHours: 0,
          totalWorkDays: 0,
          totalAbsenceDays: 0,
          totalLateDays: 0,
          lateDeductionDays: 0,
          earlyLeaveDeductionDays: 0,
          medicalLeaveDeductionDays: 0,
          totalOvertime: 0,
          totalWeeklyLeaveDays: 0,
          totalAnnualLeaveDays: 0,
          totalMedicalLeaveDays: 0,
          totalOfficialLeaveDays: 0,
          totalLeaveCompensationDays: 0,
        }
      );

      const totalDays = endDate.diff(startDate, 'days').days + 1;
      if (totals.totalWorkDays + totals.totalAbsenceDays + totals.totalAnnualLeaveDays + totals.totalMedicalLeaveDays + totals.totalOfficialLeaveDays + totals.totalLeaveCompensationDays !== totalDays) {
        totals.totalWeeklyLeaveDays = totalDays - (totals.totalWorkDays + totals.totalAbsenceDays + totals.totalAnnualLeaveDays + totals.totalMedicalLeaveDays + totals.totalOfficialLeaveDays + totals.totalLeaveCompensationDays);
      }

      const dailySalary = user.baseSalary / 30;
      const hourlyRate = dailySalary / 9;
      const overtimeValue = (totals.totalOvertime * hourlyRate).toFixed(2);
      const baseMealAllowance = user.mealAllowance;
      const mealAllowance = (baseMealAllowance - (totals.totalAbsenceDays + totals.totalAnnualLeaveDays + totals.totalMedicalLeaveDays + totals.totalOfficialLeaveDays + totals.totalLeaveCompensationDays) * 50).toFixed(2);
      const bonus = user.baseBonus * (user.bonusPercentage / 100);
      const deductionsValue = ((totals.totalAbsenceDays + totals.lateDeductionDays + totals.earlyLeaveDeductionDays + totals.medicalLeaveDeductionDays) * dailySalary + user.penaltiesValue + user.violationsInstallment).toFixed(2);

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
        totalLateDays: totals.totalLateDays,
        lateDeductionDays: totals.lateDeductionDays.toFixed(2),
        earlyLeaveDeductionDays: totals.earlyLeaveDeductionDays.toFixed(2),
        medicalLeaveDeductionDays: totals.medicalLeaveDeductionDays.toFixed(2),
        deductionsValue: parseFloat(deductionsValue),
        totalOvertime: totals.totalOvertime.toFixed(2),
        overtimeValue: parseFloat(overtimeValue),
        totalWeeklyLeaveDays: totals.totalWeeklyLeaveDays,
        totalAnnualLeaveDays: totals.totalAnnualLeaveDays,
        totalMedicalLeaveDays: totals.totalMedicalLeaveDays,
        totalOfficialLeaveDays: totals.totalOfficialLeaveDays,
        totalLeaveCompensationDays: totals.totalLeaveCompensationDays,
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
    if (!user) {
      console.error(`User not found for code ${fingerprint.code}`);
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    fingerprint.employeeName = user.fullName || 'غير معروف';
    fingerprint.monthlyLateAllowance = user.monthlyLateAllowance || 120;
    fingerprint.totalAnnualLeave = user.totalAnnualLeave || 0;
    fingerprint.annualLeaveBalance = user.annualLeaveBalance || 21;
    await fingerprint.save();

    const workDaysPerWeek = user.workDaysPerWeek || 6;
    const responseReport = {
      ...fingerprint.toObject(),
      employeeName: user.fullName || 'غير معروف',
      workDaysPerWeek,
      monthlyLateAllowance: user.monthlyLateAllowance || 120,
      totalAnnualLeave: user.totalAnnualLeave || 0,
      annualLeaveBalance: user.annualLeaveBalance || 21,
      weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, workDaysPerWeek) ? 1 : 0,
      annualLeaveDays: fingerprint.annualLeave ? 1 : 0,
      medicalLeaveDays: fingerprint.medicalLeave ? 1 : 0,
      officialLeaveDays: fingerprint.officialLeave ? 1 : 0,
      leaveCompensationDays: fingerprint.leaveCompensation ? 1 : 0,
      checkIn: fingerprint.checkIn ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
      checkOut: fingerprint.checkOut ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
      date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: fingerprint.absence ? 'نعم' : 'لا',
      annualLeave: fingerprint.annualLeave ? 'نعم' : 'لا',
      medicalLeave: fingerprint.medicalLeave ? 'نعم' : 'لا',
      officialLeave: fingerprint.officialLeave ? 'نعم' : 'لا',
      leaveCompensation: fingerprint.leaveCompensation ? 'نعم' : 'لا',
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

    const { code, date, checkIn, checkOut, absence, annualLeave, medicalLeave, officialLeave, leaveCompensation } = req.body;
    console.log('Received update request for fingerprint:', {
      id: req.params.id,
      code,
      date,
      checkIn,
      checkOut,
      absence,
      annualLeave,
      medicalLeave,
      officialLeave,
      leaveCompensation,
    });

    if ([absence, annualLeave, medicalLeave, officialLeave, leaveCompensation].filter(Boolean).length > 1) {
      console.error('Multiple status flags set for code:', code || fingerprint.code, { absence, annualLeave, medicalLeave, officialLeave, leaveCompensation });
      return res.status(400).json({ error: 'لا يمكن تحديد أكثر من حالة واحدة (غياب، إجازة سنوية، إجازة طبية، إجازة رسمية، بدل إجازة)' });
    }

    const dateDt = DateTime.fromISO(date, { zone: 'Africa/Cairo' });
    if (!dateDt.isValid) {
      console.error('Invalid date format:', date);
      return res.status(400).json({ error: 'تاريخ السجل غير صالح' });
    }

    const existingReport = await Fingerprint.findOne({
      code: code || fingerprint.code,
      date: {
        $gte: dateDt.startOf('day').toJSDate(),
        $lte: dateDt.endOf('day').toJSDate(),
      },
      _id: { $ne: req.params.id },
    });

    let targetFingerprint = fingerprint;
    if (existingReport) {
      console.log(`Found duplicate report for code ${code || fingerprint.code} on ${dateDt.toISODate()}, merging...`);
      targetFingerprint = existingReport;
      targetFingerprint.checkIn = checkIn
        ? DateTime.fromISO(checkIn, { zone: 'Africa/Cairo' }).toJSDate()
        : existingReport.checkIn;
      targetFingerprint.checkOut = checkOut
        ? DateTime.fromISO(checkOut, { zone: 'Africa/Cairo' }).toJSDate()
        : existingReport.checkOut;
      targetFingerprint.absence = absence !== undefined ? absence : existingReport.absence;
      targetFingerprint.annualLeave = annualLeave !== undefined ? annualLeave : existingReport.annualLeave;
      targetFingerprint.medicalLeave = medicalLeave !== undefined ? medicalLeave : existingReport.medicalLeave;
      targetFingerprint.officialLeave = officialLeave !== undefined ? officialLeave : existingReport.officialLeave;
      targetFingerprint.leaveCompensation = leaveCompensation !== undefined ? leaveCompensation : existingReport.leaveCompensation;
      await Fingerprint.deleteOne({ _id: req.params.id });
      console.log(`Deleted original fingerprint with ID ${req.params.id}`);
    } else {
      targetFingerprint.code = code || fingerprint.code;
      targetFingerprint.date = dateDt.toJSDate();
      targetFingerprint.checkIn = checkIn
        ? DateTime.fromISO(checkIn, { zone: 'Africa/Cairo' }).toJSDate()
        : fingerprint.checkIn;
      targetFingerprint.checkOut = checkOut
        ? DateTime.fromISO(checkOut, { zone: 'Africa/Cairo' }).toJSDate()
        : fingerprint.checkOut;
      targetFingerprint.absence = absence !== undefined ? absence : fingerprint.absence;
      targetFingerprint.annualLeave = annualLeave !== undefined ? annualLeave : fingerprint.annualLeave;
      targetFingerprint.medicalLeave = medicalLeave !== undefined ? medicalLeave : fingerprint.medicalLeave;
      targetFingerprint.officialLeave = officialLeave !== undefined ? officialLeave : fingerprint.officialLeave;
      targetFingerprint.leaveCompensation = leaveCompensation !== undefined ? leaveCompensation : fingerprint.leaveCompensation;
    }

    const user = await User.findOne({ code: targetFingerprint.code });
    if (!user) {
      console.error(`User not found for code ${targetFingerprint.code}`);
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    targetFingerprint.workDaysPerWeek = user.workDaysPerWeek || 6;
    targetFingerprint.employeeName = user.fullName || 'غير معروف';
    targetFingerprint.monthlyLateAllowance = user.monthlyLateAllowance || 120;
    targetFingerprint.totalAnnualLeave = user.totalAnnualLeave || 0;
    targetFingerprint.annualLeaveBalance = user.annualLeaveBalance || 21;

    if (targetFingerprint.annualLeave) {
      console.log(`Applying annual leave for ${targetFingerprint.code} on ${dateDt.toISODate()}`);
      targetFingerprint.checkIn = DateTime.fromObject(
        { hour: 8, minute: 30 },
        { zone: 'Africa/Cairo' }
      ).toJSDate();
      targetFingerprint.checkOut = DateTime.fromObject(
        { hour: 17, minute: 30 },
        { zone: 'Africa/Cairo' }
      ).toJSDate();
      targetFingerprint.workHours = 8;
      targetFingerprint.lateMinutes = 0;
      targetFingerprint.lateDeduction = 0;
      targetFingerprint.earlyLeaveDeduction = 0;
      targetFingerprint.overtime = 0;
      targetFingerprint.absence = false;
      targetFingerprint.medicalLeave = false;
      targetFingerprint.officialLeave = false;
      targetFingerprint.leaveCompensation = false;
      targetFingerprint.medicalLeaveDeduction = 0;

      if (annualLeave && !fingerprint.annualLeave) {
        user.totalAnnualLeave = (user.totalAnnualLeave || 0) + 1;
        user.annualLeaveBalance = Math.max((user.annualLeaveBalance || 21) - 1, 0);
        await user.save();
        console.log(`Updated user ${user.code}: totalAnnualLeave=${user.totalAnnualLeave}, annualLeaveBalance=${user.annualLeaveBalance}`);
      }
    } else if (!annualLeave && fingerprint.annualLeave) {
      user.totalAnnualLeave = Math.max((user.totalAnnualLeave || 0) - 1, 0);
      user.annualLeaveBalance = (user.annualLeaveBalance || 21) + 1;
      await user.save();
      console.log(`Reverted annual leave for ${user.code}: totalAnnualLeave=${user.totalAnnualLeave}, annualLeaveBalance=${user.annualLeaveBalance}`);
    } else if (targetFingerprint.medicalLeave) {
      console.log(`Applying medical leave for ${targetFingerprint.code} on ${dateDt.toISODate()}`);
      targetFingerprint.checkIn = null;
      targetFingerprint.checkOut = null;
      targetFingerprint.workHours = 0;
      targetFingerprint.lateMinutes = 0;
      targetFingerprint.lateDeduction = 0;
      targetFingerprint.earlyLeaveDeduction = 0;
      targetFingerprint.overtime = 0;
      targetFingerprint.absence = false;
      targetFingerprint.annualLeave = false;
      targetFingerprint.officialLeave = false;
      targetFingerprint.leaveCompensation = false;
      targetFingerprint.medicalLeaveDeduction = 0.25;
    } else if (targetFingerprint.officialLeave) {
      console.log(`Applying official leave for ${targetFingerprint.code} on ${dateDt.toISODate()}`);
      targetFingerprint.checkIn = null;
      targetFingerprint.checkOut = null;
      targetFingerprint.workHours = 0;
      targetFingerprint.lateMinutes = 0;
      targetFingerprint.lateDeduction = 0;
      targetFingerprint.earlyLeaveDeduction = 0;
      targetFingerprint.overtime = 0;
      targetFingerprint.absence = false;
      targetFingerprint.annualLeave = false;
      targetFingerprint.medicalLeave = false;
      targetFingerprint.leaveCompensation = false;
      targetFingerprint.medicalLeaveDeduction = 0;
    } else if (targetFingerprint.leaveCompensation) {
      console.log(`Applying leave compensation for ${targetFingerprint.code} on ${dateDt.toISODate()}`);
      targetFingerprint.checkIn = null;
      targetFingerprint.checkOut = null;
      targetFingerprint.workHours = 0;
      targetFingerprint.lateMinutes = 0;
      targetFingerprint.lateDeduction = 0;
      targetFingerprint.earlyLeaveDeduction = 0;
      targetFingerprint.overtime = 0;
      targetFingerprint.absence = false;
      targetFingerprint.annualLeave = false;
      targetFingerprint.medicalLeave = false;
      targetFingerprint.officialLeave = false;
      targetFingerprint.medicalLeaveDeduction = 0;
      if (leaveCompensation && !fingerprint.leaveCompensation) {
        user.totalAnnualLeave = (user.totalAnnualLeave || 0) + 1;
        user.annualLeaveBalance = Math.max((user.annualLeaveBalance || 21) - 1, 0);
        await user.save();
        console.log(`Updated user ${user.code} for leave compensation: totalAnnualLeave=${user.totalAnnualLeave}, annualLeaveBalance=${user.annualLeaveBalance}`);
      }
    } else {
      await targetFingerprint.calculateAttendance();
      await handleLateDeduction(targetFingerprint);
      await handleEarlyLeaveDeduction(targetFingerprint);
    }

    try {
      await targetFingerprint.save();
      console.log(`Saved fingerprint for code ${targetFingerprint.code} on ${dateDt.toISODate()}`);
    } catch (saveError) {
      console.error(`Failed to save fingerprint for code ${targetFingerprint.code}:`, saveError.message);
      return res.status(500).json({ error: 'خطأ في حفظ السجل', details: saveError.message });
    }

    const responseReport = {
      ...targetFingerprint.toObject(),
      employeeName: user.fullName || 'غير معروف',
      workDaysPerWeek: user.workDaysPerWeek || 6,
      monthlyLateAllowance: user.monthlyLateAllowance || 120,
      totalAnnualLeave: user.totalAnnualLeave || 0,
      annualLeaveBalance: user.annualLeaveBalance || 21,
      weeklyLeaveDays: isWeeklyLeaveDay(targetFingerprint.date, user.workDaysPerWeek) ? 1 : 0,
      annualLeaveDays: targetFingerprint.annualLeave ? 1 : 0,
      medicalLeaveDays: targetFingerprint.medicalLeave ? 1 : 0,
      officialLeaveDays: targetFingerprint.officialLeave ? 1 : 0,
      leaveCompensationDays: targetFingerprint.leaveCompensation ? 1 : 0,
      checkIn: targetFingerprint.checkIn
        ? DateTime.fromJSDate(targetFingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      checkOut: targetFingerprint.checkOut
        ? DateTime.fromJSDate(targetFingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      date: DateTime.fromJSDate(targetFingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: targetFingerprint.absence ? 'نعم' : 'لا',
      annualLeave: targetFingerprint.annualLeave ? 'نعم' : 'لا',
      medicalLeave: targetFingerprint.medicalLeave ? 'نعم' : 'لا',
      officialLeave: targetFingerprint.officialLeave ? 'نعم' : 'لا',
      leaveCompensation: targetFingerprint.leaveCompensation ? 'نعم' : 'لا',
      isSingleFingerprint: targetFingerprint.isSingleFingerprint ? 'نعم' : '',
    };

    res.json({
      message: existingReport ? 'تم دمج السجل المكرر وتحديثه بنجاح' : 'تم حفظ التعديلات بنجاح',
      report: responseReport,
    });
  } catch (error) {
    console.error('Error in update route:', error.message, error.stack);
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

router.post('/medical-leave', authMiddleware, async (req, res) => {
  try {
    const { code, dateFrom, dateTo } = req.body;
    const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
    const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });

    if (!startDate.isValid || !endDate.isValid) {
      console.error('Invalid date range:', { dateFrom, dateTo });
      return res.status(400).json({ error: 'تاريخ البداية أو النهاية غير صالح' });
    }

    if (startDate > endDate) {
      console.error('Start date is after end date:', { dateFrom, dateTo });
      return res.status(400).json({ error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
    }

    const user = await User.findOne({ code });
    if (!user) {
      console.error(`User not found for code ${code}`);
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const workDaysPerWeek = user.workDaysPerWeek || 6;
    const reports = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISODate();
      const isWeekly = isWeeklyLeaveDay(currentDate.toJSDate(), workDaysPerWeek);

      if (!isWeekly) {
        const existingReport = await Fingerprint.findOne({
          code,
          date: {
            $gte: currentDate.startOf('day').toJSDate(),
            $lte: currentDate.endOf('day').toJSDate(),
          },
        });

        let fingerprint;
        if (existingReport) {
          console.log(`Updating existing report for medical leave for ${code} on ${dateStr}`);
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
          fingerprint.officialLeave = false;
          fingerprint.leaveCompensation = false;
          fingerprint.medicalLeaveDeduction = 0.25;
          fingerprint.employeeName = user.fullName || 'غير معروف';
          fingerprint.monthlyLateAllowance = user.monthlyLateAllowance || 120;
          fingerprint.totalAnnualLeave = user.totalAnnualLeave || 0;
          fingerprint.annualLeaveBalance = user.annualLeaveBalance || 21;
        } else {
          console.log(`Creating new report for medical leave for ${code} on ${dateStr}`);
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
            officialLeave: false,
            leaveCompensation: false,
            medicalLeaveDeduction: 0.25,
            isSingleFingerprint: false,
            workDaysPerWeek,
            employeeName: user.fullName || 'غير معروف',
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            totalAnnualLeave: user.totalAnnualLeave || 0,
            annualLeaveBalance: user.annualLeaveBalance || 21,
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
        const workDaysPerWeek = user ? user.workDaysPerWeek : 6;
        return {
          ...report.toObject(),
          employeeName: user ? user.fullName : 'غير معروف',
          workDaysPerWeek,
          monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
          totalAnnualLeave: user ? user.totalAnnualLeave : 0,
          annualLeaveBalance: user ? user.annualLeaveBalance : 21,
          weeklyLeaveDays: isWeeklyLeaveDay(report.date, workDaysPerWeek) ? 1 : 0,
          annualLeaveDays: report.annualLeave ? 1 : 0,
          medicalLeaveDays: report.medicalLeave ? 1 : 0,
          officialLeaveDays: report.officialLeave ? 1 : 0,
          leaveCompensationDays: report.leaveCompensation ? 1 : 0,
          checkIn: report.checkIn ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          checkOut: report.checkOut ? DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          date: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate(),
          absence: report.absence ? 'نعم' : 'لا',
          annualLeave: report.annualLeave ? 'نعم' : 'لا',
          medicalLeave: report.medicalLeave ? 'نعم' : 'لا',
          officialLeave: report.officialLeave ? 'نعم' : 'لا',
          leaveCompensation: report.leaveCompensation ? 'نعم' : 'لا',
          isSingleFingerprint: report.isSingleFingerprint ? 'نعم' : '',
        };
      })
    );

    res.json({ message: 'تم إنشاء/تحديث الإجازة الطبية بنجاح', reports: responseReports });
  } catch (error) {
    console.error('Error in medical leave route:', error.message);
    res.status(500).json({ error: 'خطأ في إنشاء/تحديث الإجازة الطبية', details: error.message });
  }
});

router.post('/official-leave', authMiddleware, async (req, res) => {
  try {
    const { code, dateFrom, dateTo } = req.body;
    const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
    const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });

    if (!startDate.isValid || !endDate.isValid) {
      console.error('Invalid date range:', { dateFrom, dateTo });
      return res.status(400).json({ error: 'تاريخ البداية أو النهاية غير صالح' });
    }

    if (startDate > endDate) {
      console.error('Start date is after end date:', { dateFrom, dateTo });
      return res.status(400).json({ error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
    }

    const user = await User.findOne({ code });
    if (!user) {
      console.error(`User not found for code ${code}`);
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const workDaysPerWeek = user.workDaysPerWeek || 6;
    const reports = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISODate();
      const isWeekly = isWeeklyLeaveDay(currentDate.toJSDate(), workDaysPerWeek);

      if (!isWeekly) {
        const existingReport = await Fingerprint.findOne({
          code,
          date: {
            $gte: currentDate.startOf('day').toJSDate(),
            $lte: currentDate.endOf('day').toJSDate(),
          },
        });

        let fingerprint;
        if (existingReport) {
          console.log(`Updating existing report for official leave for ${code} on ${dateStr}`);
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
          fingerprint.medicalLeave = false;
          fingerprint.officialLeave = true;
          fingerprint.leaveCompensation = false;
          fingerprint.medicalLeaveDeduction = 0;
          fingerprint.employeeName = user.fullName || 'غير معروف';
          fingerprint.monthlyLateAllowance = user.monthlyLateAllowance || 120;
          fingerprint.totalAnnualLeave = user.totalAnnualLeave || 0;
          fingerprint.annualLeaveBalance = user.annualLeaveBalance || 21;
        } else {
          console.log(`Creating new report for official leave for ${code} on ${dateStr}`);
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
            medicalLeave: false,
            officialLeave: true,
            leaveCompensation: false,
            medicalLeaveDeduction: 0,
            isSingleFingerprint: false,
            workDaysPerWeek,
            employeeName: user.fullName || 'غير معروف',
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            totalAnnualLeave: user.totalAnnualLeave || 0,
            annualLeaveBalance: user.annualLeaveBalance || 21,
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
        const workDaysPerWeek = user ? butcher.workDaysPerWeek : 6;
        return {
          ...report.toObject(),
          employeeName: user ? user.fullName : 'غير معروف',
          workDaysPerWeek,
          monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
          totalAnnualLeave: user ? user.totalAnnualLeave : 0,
          annualLeaveBalance: user ? user.annualLeaveBalance : 21,
          weeklyLeaveDays: isWeeklyLeaveDay(report.date, workDaysPerWeek) ? 1 : 0,
          annualLeaveDays: report.annualLeave ? 1 : 0,
          medicalLeaveDays: report.medicalLeave ? 1 : 0,
          officialLeaveDays: report.officialLeave ? 1 : 0,
          leaveCompensationDays: report.leaveCompensation ? 1 : 0,
          checkIn: report.checkIn ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          checkOut: report.checkOut ? DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          date: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate(),
          absence: report.absence ? 'نعم' : 'لا',
          annualLeave: report.annualLeave ? 'نعم' : 'لا',
          medicalLeave: report.medicalLeave ? 'نعم' : 'لا',
          officialLeave: report.officialLeave ? 'نعم' : 'لا',
          leaveCompensation: report.leaveCompensation ? 'نعم' : 'لا',
          isSingleFingerprint: report.isSingleFingerprint ? 'نعم' : '',
        };
      })
    );

    res.json({ message: 'تم إنشاء/تحديث الإجازة الرسمية بنجاح', reports: responseReports });
  } catch (error) {
    console.error('Error in official leave route:', error.message);
    res.status(500).json({ error: 'خطأ في إنشاء/تحديث الإجازة الرسمية', details: error.message });
  }
});

router.post('/leave-compensation', authMiddleware, async (req, res) => {
  try {
    const { code, dateFrom, dateTo } = req.body;
    const startDate = DateTime.fromISO(dateFrom, { zone: 'Africa/Cairo' });
    const endDate = DateTime.fromISO(dateTo, { zone: 'Africa/Cairo' });

    if (!startDate.isValid || !endDate.isValid) {
      console.error('Invalid date range:', { dateFrom, dateTo });
      return res.status(400).json({ error: 'تاريخ البداية أو النهاية غير صالح' });
    }

    if (startDate > endDate) {
      console.error('Start date is after end date:', { dateFrom, dateTo });
      return res.status(400).json({ error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
    }

    const user = await User.findOne({ code });
    if (!user) {
      console.error(`User not found for code ${code}`);
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const workDaysPerWeek = user.workDaysPerWeek || 6;
    const reports = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISODate();
      const isWeekly = isWeeklyLeaveDay(currentDate.toJSDate(), workDaysPerWeek);

      if (!isWeekly) {
        const existingReport = await Fingerprint.findOne({
          code,
          date: {
            $gte: currentDate.startOf('day').toJSDate(),
            $lte: currentDate.endOf('day').toJSDate(),
          },
        });

        let fingerprint;
        if (existingReport) {
          console.log(`Updating existing report for leave compensation for ${code} on ${dateStr}`);
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
          fingerprint.medicalLeave = false;
          fingerprint.officialLeave = false;
          fingerprint.leaveCompensation = true;
          fingerprint.medicalLeaveDeduction = 0;
          fingerprint.employeeName = user.fullName || 'غير معروف';
          fingerprint.monthlyLateAllowance = user.monthlyLateAllowance || 120;
          fingerprint.totalAnnualLeave = user.totalAnnualLeave || 0;
          fingerprint.annualLeaveBalance = user.annualLeaveBalance || 21;
        } else {
          console.log(`Creating new report for leave compensation for ${code} on ${dateStr}`);
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
            medicalLeave: false,
            officialLeave: false,
            leaveCompensation: true,
            medicalLeaveDeduction: 0,
            isSingleFingerprint: false,
            workDaysPerWeek,
            employeeName: user.fullName || 'غير معروف',
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            totalAnnualLeave: user.totalAnnualLeave || 0,
            annualLeaveBalance: user.annualLeaveBalance || 21,
          });
        }

        if (fingerprint.leaveCompensation && !existingReport?.leaveCompensation) {
          user.totalAnnualLeave = (user.totalAnnualLeave || 0) + 1;
          user.annualLeaveBalance = Math.max((user.annualLeaveBalance || 21) - 1, 0);
          await user.save();
          console.log(`Updated user ${user.code} for leave compensation: totalAnnualLeave=${user.totalAnnualLeave}, annualLeaveBalance=${user.annualLeaveBalance}`);
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
        const workDaysPerWeek = user ? user.workDaysPerWeek : 6;
        return {
          ...report.toObject(),
          employeeName: user ? user.fullName : 'غير معروف',
          workDaysPerWeek,
          monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
          totalAnnualLeave: user ? user.totalAnnualLeave : 0,
          annualLeaveBalance: user ? user.annualLeaveBalance : 21,
          weeklyLeaveDays: isWeeklyLeaveDay(report.date, workDaysPerWeek) ? 1 : 0,
          annualLeaveDays: report.annualLeave ? 1 : 0,
          medicalLeaveDays: report.medicalLeave ? 1 : 0,
          officialLeaveDays: report.officialLeave ? 1 : 0,
          leaveCompensationDays: report.leaveCompensation ? 1 : 0,
          checkIn: report.checkIn ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          checkOut: report.checkOut ? DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a') : null,
          date: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate(),
          absence: report.absence ? 'نعم' : 'لا',
          annualLeave: report.annualLeave ? 'نعم' : 'لا',
          medicalLeave: report.medicalLeave ? 'نعم' : 'لا',
          officialLeave: report.officialLeave ? 'نعم' : 'لا',
          leaveCompensation: report.leaveCompensation ? 'نعم' : 'لا',
          isSingleFingerprint: report.isSingleFingerprint ? 'نعم' : '',
        };
      })
    );

    res.json({ message: 'تم إنشاء/تحديث بدل الإجازة بنجاح', reports: responseReports });
  } catch (error) {
    console.error('Error in leave compensation route:', error.message);
    res.status(500).json({ error: 'خطأ في إنشاء/تحديث بدل الإجازة', details: error.message });
  }
});

export default router;
