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
  const dayOfWeek = DateTime.fromJSDate(date, { zone: 'Africa/Cairo' }).weekday; // 1=الإثنين, 5=الجمعة, 6=السبت
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

    if (report.checkIn) {
      const checkInTime = DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' });
      if (!checkInTime.isValid) {
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
        } else if (checkInTime.toMillis() >= lateLimit.toMillis()) {
          if (monthlyLateAllowance >= diffMinutes) {
            monthlyLateAllowance -= diffMinutes;
            report.lateDeduction = 0;
            if (user) {
              user.monthlyLateAllowance = monthlyLateAllowance;
              await user.save();
            }
          } else {
            report.lateDeduction = 0.25;
            if (user) {
              user.monthlyLateAllowance = 0;
              await user.save();
            }
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
    if (report.checkOut) {
      const checkOutTime = DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' });
      if (!checkOutTime.isValid) {
        report.earlyLeaveDeduction = 0;
        return;
      }

      const earlyLeaveThreshold = checkOutTime.set({ hour: 15, minute: 0, second: 0, millisecond: 0 });
      const earlyLeaveLimit = checkOutTime.set({ hour: 16, minute: 0, second: 0, millisecond: 0 });

      if (checkOutTime.toMillis() <= earlyLeaveThreshold.toMillis()) {
        report.earlyLeaveDeduction = 0.5;
      } else if (checkOutTime.toMillis() <= earlyLeaveLimit.toMillis()) {
        report.earlyLeaveDeduction = 0.25;
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

    const mergedReports = [];
    const groupedByCodeAndDate = {};

    for (const report of reports) {
      const date = report.date ? DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).toISODate() : null;
      if (!date) {
        console.warn(`Skipping report with invalid date for code ${report.code}: ${report.date}`);
        continue;
      }
      const key = `${report.code}-${date}`;
      if (!groupedByCodeAndDate[key]) {
        groupedByCodeAndDate[key] = [];
      }
      groupedByCodeAndDate[key].push(report);
    }

    for (const key in groupedByCodeAndDate) {
      const group = groupedByCodeAndDate[key];
      let mergedReport = null;

      for (const report of group) {
        const checkTime = report.checkIn || report.checkOut;
        if (!checkTime) continue;

        const checkTimeDt = report.checkIn ? DateTime.fromJSDate(report.checkIn, { zone: 'Africa/Cairo' }) :
                                            DateTime.fromJSDate(report.checkOut, { zone: 'Africa/Cairo' });
        if (!checkTimeDt.isValid) {
          console.warn(`Invalid check time for code ${report.code} on ${report.date}: ${checkTime}`);
          continue;
        }

        if (!mergedReport) {
          mergedReport = { ...report };
          mergedReport.checkIn = report.checkIn;
          mergedReport.checkOut = report.checkOut;
        } else {
          const existingCheckIn = mergedReport.checkIn ? DateTime.fromJSDate(mergedReport.checkIn, { zone: 'Africa/Cairo' }) : null;
          const existingCheckOut = mergedReport.checkOut ? DateTime.fromJSDate(mergedReport.checkOut, { zone: 'Africa/Cairo' }) : null;

          if (existingCheckIn && checkTimeDt.diff(existingCheckIn, 'seconds').seconds < 60) {
            continue;
          } else if (existingCheckOut && checkTimeDt.diff(existingCheckOut, 'seconds').seconds < 60) {
            continue;
          } else if (!mergedReport.checkIn && report.checkIn) {
            mergedReport.checkIn = report.checkIn;
          } else if (!mergedReport.checkOut && report.checkOut) {
            mergedReport.checkOut = report.checkOut;
          }
        }
      }

      if (mergedReport) {
        const user = await User.findOne({ code: mergedReport.code });
        const checkInDt = mergedReport.checkIn ? DateTime.fromJSDate(mergedReport.checkIn, { zone: 'Africa/Cairo' }) : null;
        const checkOutDt = mergedReport.checkOut ? DateTime.fromJSDate(mergedReport.checkOut, { zone: 'Africa/Cairo' }) : null;
        mergedReports.push({
          ...mergedReport,
          checkIn: checkInDt && checkInDt.isValid ? checkInDt.toJSDate() : null,
          checkOut: checkOutDt && checkOutDt.isValid ? checkOutDt.toJSDate() : null,
          date: mergedReport.date ? DateTime.fromJSDate(mergedReport.date, { zone: 'Africa/Cairo' }).toJSDate() : null,
          workDaysPerWeek: user ? user.workDaysPerWeek : 6,
        });
      }
    }

    reports = mergedReports.filter(report => report !== null && report.date !== null);

    if (!reports.length) {
      console.error('All reports failed time conversion or merging');
      return res.status(400).json({ message: 'فشل تحويل التوقيتات أو دمج التقارير' });
    }

    const finalReports = [];
    for (const report of reports) {
      try {
        const user = await User.findOne({ code: report.code });
        const existingReport = await Fingerprint.findOne({
          code: report.code,
          date: {
            $gte: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).startOf('day').toJSDate(),
            $lte: DateTime.fromJSDate(report.date, { zone: 'Africa/Cairo' }).endOf('day').toJSDate(),
          },
        });

        if (existingReport) {
          existingReport.checkIn = report.checkIn || existingReport.checkIn;
          existingReport.checkOut = report.checkOut || existingReport.checkOut;
          existingReport.workDaysPerWeek = report.workDaysPerWeek;
          await existingReport.calculateAttendance();
          await handleLateDeduction(existingReport);
          await handleEarlyLeaveDeduction(existingReport);
          await existingReport.save();
          finalReports.push({
            ...existingReport.toObject(),
            employeeName: user?.fullName || 'غير معروف',
            workDaysPerWeek: report.workDaysPerWeek,
            monthlyLateAllowance: user?.monthlyLateAllowance || 120,
            weeklyLeaveDays: isWeeklyLeaveDay(existingReport.date, report.workDaysPerWeek) ? 1 : 0,
          });
          continue;
        }

        const fingerprint = new Fingerprint({
          ...report,
          workDaysPerWeek: report.workDaysPerWeek,
        });
        await fingerprint.calculateAttendance();
        await handleLateDeduction(fingerprint);
        await handleEarlyLeaveDeduction(fingerprint);
        await fingerprint.save();
        finalReports.push({
          ...fingerprint.toObject(),
          employeeName: user?.fullName || 'غير معروف',
          workDaysPerWeek: report.workDaysPerWeek,
          monthlyLateAllowance: user?.monthlyLateAllowance || 120,
          weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, report.workDaysPerWeek) ? 1 : 0,
        });
      } catch (err) {
        console.error(`Error processing report for code ${report.code}:`, err.message);
      }
    }

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

      const startDate = DateTime.fromJSDate(new Date(dateFrom), { zone: 'Africa/Cairo' });
      const endDate = DateTime.fromJSDate(new Date(dateTo), { zone: 'Africa/Cairo' });
      const users = code ? await User.find({ code }) : await User.find();
      const missingReports = [];

      for (let user of users) {
        let currentDate = startDate;
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISODate();
          const existingReport = reports.find(
            r => r.code === user.code && DateTime.fromJSDate(r.date).toISODate() === dateStr
          );
          if (!existingReport && !isWeeklyLeaveDay(currentDate.toJSDate(), user.workDaysPerWeek)) {
            const absenceReport = new Fingerprint({
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
              isSingleFingerprint: false,
              workDaysPerWeek: user.workDaysPerWeek,
            });
            await absenceReport.save();
            missingReports.push(absenceReport);
          }
          else if (!existingReport && isWeeklyLeaveDay(currentDate.toJSDate(), user.workDaysPerWeek)) {
            const weeklyLeaveReport = new Fingerprint({
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
              isSingleFingerprint: false,
              workDaysPerWeek: user.workDaysPerWeek,
            });
            await weeklyLeaveReport.save();
            missingReports.push(weeklyLeaveReport);
          }
          currentDate = currentDate.plus({ days: 1 });
        }
      }

      if (code && users.length === 0) {
        let currentDate = startDate;
        const defaultWorkDaysPerWeek = 6;
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISODate();
          const existingReport = reports.find(
            r => r.code === code && DateTime.fromJSDate(r.date).toISODate() === dateStr
          );
          if (!existingReport && !isWeeklyLeaveDay(currentDate.toJSDate(), defaultWorkDaysPerWeek)) {
            const absenceReport = new Fingerprint({
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
              isSingleFingerprint: false,
              workDaysPerWeek: defaultWorkDaysPerWeek,
            });
            await absenceReport.save();
            missingReports.push(absenceReport);
          } else if (!existingReport && isWeeklyLeaveDay(currentDate.toJSDate(), defaultWorkDaysPerWeek)) {
            const weeklyLeaveReport = new Fingerprint({
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
              isSingleFingerprint: false,
              workDaysPerWeek: defaultWorkDaysPerWeek,
            });
            await weeklyLeaveReport.save();
            missingReports.push(weeklyLeaveReport);
          }
          currentDate = currentDate.plus({ days: 1 });
        }
      }

      reports = [...reports, ...missingReports].sort((a, b) => new Date(a.date) - new Date(b.date));
    } else {
      reports = await Fingerprint.find(query).sort({ date: 1 });
    }

    const responseReports = await Promise.all(
      reports.map(async report => {
        const user = await User.findOne({ code: report.code });
        const workDaysPerWeek = user ? user.workDaysPerWeek : 6;
        const weeklyLeaveDays = isWeeklyLeaveDay(report.date, workDaysPerWeek) ? 1 : 0;
        return {
          ...report.toObject(),
          employeeName: user ? user.fullName : 'غير معروف',
          workDaysPerWeek,
          weeklyLeaveDays,
          monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
          absence: report.absence ? 'نعم' : 'لا',
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
      ? calculateWeeklyLeaveDays(dateFrom, dateTo, responseReports[0]?.workDaysPerWeek || 6)
      : 0;

    res.json({ reports: responseReports, totalWeeklyLeaveDays });
  } catch (error) {
    console.error('Error in search route:', error.message);
    res.status(500).json({ message: 'خطأ في البحث', error: error.message });
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
    const workDaysPerWeek = user ? user.workDaysPerWeek : 6;
    const responseReport = {
      ...fingerprint.toObject(),
      employeeName: user ? user.fullName : 'غير معروف',
      workDaysPerWeek,
      monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
      weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, workDaysPerWeek) ? 1 : 0,
      checkIn: fingerprint.checkIn && DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      checkOut: fingerprint.checkOut && DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: fingerprint.absence ? 'نعم' : 'لا',
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

    const date = DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' });
    if (!date.isValid) {
      return res.status(400).json({ error: 'تاريخ السجل غير صالح' });
    }
    const dateStr = date.toFormat('yyyy-MM-dd');

    let checkInTime = null;
    let checkOutTime = null;

    if (req.body.checkIn) {
      const formats = [
        'hh:mm:ss a', // 09:30:00 AM
        'HH:mm:ss',   // 09:30:00
        'hh:mm a',    // 09:30 AM
        'HH:mm',      // 09:30
      ];

      for (const format of formats) {
        checkInTime = DateTime.fromFormat(
          `${dateStr} ${req.body.checkIn}`,
          `yyyy-MM-dd ${format}`,
          { zone: 'Africa/Cairo' }
        );
        if (checkInTime.isValid) break;
      }

      if (!checkInTime.isValid) {
        return res.status(400).json({ error: 'توقيت الحضور غير صالح' });
      }
    }

    if (req.body.checkOut) {
      const formats = [
        'hh:mm:ss a', // 05:30:00 PM
        'HH:mm:ss',   // 17:30:00
        'hh:mm a',    // 05:30 PM
        'HH:mm',      // 17:30
      ];

      for (const format of formats) {
        checkOutTime = DateTime.fromFormat(
          `${dateStr} ${req.body.checkOut}`,
          `yyyy-MM-dd ${format}`,
          { zone: 'Africa/Cairo' }
        );
        if (checkOutTime.isValid) break;
      }

      if (!checkOutTime.isValid) {
        return res.status(400).json({ error: 'توقيت الانصراف غير صالح' });
      }
    }

    fingerprint.checkIn = checkInTime ? checkInTime.toJSDate() : null;
    fingerprint.checkOut = checkOutTime ? checkOutTime.toJSDate() : null;

    await fingerprint.calculateAttendance();
    await handleLateDeduction(fingerprint);
    await handleEarlyLeaveDeduction(fingerprint);
    await fingerprint.save();

    const user = await User.findOne({ code: fingerprint.code });
    const workDaysPerWeek = user ? user.workDaysPerWeek : 6;
    const responseReport = {
      ...fingerprint.toObject(),
      employeeName: user ? user.fullName : 'غير معروف',
      workDaysPerWeek,
      monthlyLateAllowance: user ? user.monthlyLateAllowance : 120,
      weeklyLeaveDays: isWeeklyLeaveDay(fingerprint.date, workDaysPerWeek) ? 1 : 0,
      checkIn: fingerprint.checkIn && DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkIn, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      checkOut: fingerprint.checkOut && DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).isValid
        ? DateTime.fromJSDate(fingerprint.checkOut, { zone: 'Africa/Cairo' }).toFormat('hh:mm:ss a')
        : null,
      date: DateTime.fromJSDate(fingerprint.date, { zone: 'Africa/Cairo' }).toISODate(),
      absence: fingerprint.absence ? 'نعم' : 'لا',
      isSingleFingerprint: fingerprint.isSingleFingerprint ? 'نعم' : '',
    };

    res.json({ message: 'تم حفظ التعديلات بنجاح', report: responseReport });
  } catch (error) {
    console.error('Error in update route:', error.message);
    res.status(500).json({ error: 'خطأ في التعديل', details: error.message });
  }
});

export default router;
