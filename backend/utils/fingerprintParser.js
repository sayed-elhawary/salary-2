import XLSX from 'xlsx';
import { DateTime } from 'luxon';
import Fingerprint from '../models/Fingerprint.js';

export const parseFingerprintFile = async (file) => {
  try {
    if (!file || !file.buffer) {
      console.error('No file or file buffer provided');
      throw new Error('لم يتم توفير ملف صالح');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      console.error('No sheets found in the Excel file');
      throw new Error('لا توجد صفحات في ملف Excel');
    }

    const data = XLSX.utils.sheet_to_json(sheet);
    if (!data || data.length === 0) {
      console.error('No data found in the Excel sheet');
      throw new Error('لا توجد بيانات في ملف Excel');
    }

    console.log('Excel data rows:', data.length);

    const reports = [];
    const groupedByCodeAndDate = {};

    for (const [index, row] of data.entries()) {
      try {
        const code = row['No.']?.toString();
        const dateTimeStr = row['Date/Time'];

        if (!code || !dateTimeStr) {
          console.warn(`Skipping row ${index + 2}: Missing code or date/time - Code: ${code}, Date/Time: ${dateTimeStr}`);
          continue;
        }

        let dateTime = DateTime.fromFormat(dateTimeStr, 'M/d/yyyy h:mm:ss a', {
          zone: 'Africa/Cairo',
          locale: 'en-US',
        });

        if (!dateTime.isValid) {
          dateTime = DateTime.fromFormat(dateTimeStr, 'dd/MM/yyyy HH:mm:ss', {
            zone: 'Africa/Cairo',
            locale: 'en-US',
          });
        }

        if (!dateTime.isValid) {
          dateTime = DateTime.fromFormat(dateTimeStr, 'yyyy-MM-dd HH:mm:ss', {
            zone: 'Africa/Cairo',
            locale: 'en-US',
          });
        }

        if (!dateTime.isValid) {
          dateTime = DateTime.fromFormat(dateTimeStr, 'dd-MM-yyyy HH:mm:ss', {
            zone: 'Africa/Cairo',
            locale: 'en-US',
          });
        }

        if (!dateTime.isValid) {
          console.warn(`Skipping row ${index + 2}: Invalid date/time format - ${dateTimeStr}, Reason: ${dateTime.invalidReason}`);
          continue;
        }

        const date = dateTime.toJSDate();
        const dateKey = dateTime.toISODate();
        const key = `${code}-${dateKey}`;

        if (!groupedByCodeAndDate[key]) {
          groupedByCodeAndDate[key] = [];
        }
        groupedByCodeAndDate[key].push({ dateTime, rowIndex: index + 2 });
        console.log(`Added entry for code ${code} on ${dateKey}: ${dateTimeStr}`);
      } catch (err) {
        console.error(`Error processing row ${index + 2}:`, err.message);
      }
    }

    for (const key in groupedByCodeAndDate) {
      try {
        const entries = groupedByCodeAndDate[key].sort((a, b) => a.dateTime.toMillis() - b.dateTime.toMillis());
        let checkIn = null;
        let checkOut = null;

        const filteredEntries = [];
        let lastTime = null;
        for (const entry of entries) {
          if (!lastTime || entry.dateTime.diff(lastTime, 'seconds').seconds >= 60) {
            filteredEntries.push(entry.dateTime);
            lastTime = entry.dateTime;
          }
        }

        if (filteredEntries.length === 1) {
          const entry = filteredEntries[0];
          if (entry.hour < 12) {
            checkIn = entry.toJSDate();
          } else {
            checkOut = entry.toJSDate();
          }
        } else if (filteredEntries.length > 1) {
          checkIn = filteredEntries[0].toJSDate();
          checkOut = filteredEntries[filteredEntries.length - 1].toJSDate();
        }

        console.log(`Processing group ${key}: checkIn=${checkIn}, checkOut=${checkOut}`);

        if (checkIn || checkOut) {
          const [code, dateKey] = key.split('-');
          const existingReport = await Fingerprint.findOne({
            code,
            date: {
              $gte: DateTime.fromISO(dateKey, { zone: 'Africa/Cairo' }).startOf('day').toJSDate(),
              $lte: DateTime.fromISO(dateKey, { zone: 'Africa/Cairo' }).endOf('day').toJSDate(),
            },
          });

          if (!existingReport) {
            reports.push({
              code,
              checkIn,
              checkOut,
              workHours: 0,
              overtime: 0,
              lateMinutes: 0,
              lateDeduction: 0,
              earlyLeaveDeduction: 0,
              absence: false,
              date: filteredEntries[0].toJSDate(),
              workDaysPerWeek: 5, // سيتم تحديثه لاحقًا
            });
          } else {
            console.log(`Skipping duplicate report for code ${code} on ${dateKey}`);
          }
        }
      } catch (err) {
        console.error(`Error processing group ${key}:`, err.message);
      }
    }

    if (reports.length === 0) {
      console.error('No valid reports generated from the file');
      throw new Error('لا توجد بيانات صالحة في الملف');
    }

    console.log('Generated reports:', reports.length);
    return reports;
  } catch (error) {
    console.error('Error in parseFingerprintFile:', error.message);
    throw new Error(`خطأ في تحليل الملف: ${error.message}`);
  }
};
