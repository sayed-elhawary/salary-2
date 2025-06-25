import mongoose from 'mongoose';
import { DateTime } from 'luxon';

const fingerprintSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
  },
  date: {
    type: Date,
    required: true,
  },
  checkIn: {
    type: Date,
  },
  checkOut: {
    type: Date,
  },
  workHours: {
    type: Number,
    default: 0,
  },
  overtime: {
    type: Number,
    default: 0,
  },
  lateMinutes: {
    type: Number,
    default: 0,
  },
  lateDeduction: {
    type: Number,
    default: 0,
  },
  earlyLeaveDeduction: {
    type: Number,
    default: 0,
  },
  absence: {
    type: Boolean,
    default: false,
  },
  isSingleFingerprint: {
    type: Boolean,
    default: false,
  },
  workDaysPerWeek: {
    type: Number,
    enum: [5, 6],
    default: 6,
  },
}, {
  timestamps: true,
});

fingerprintSchema.methods.calculateAttendance = async function () {
  try {
    const checkIn = this.checkIn ? DateTime.fromJSDate(this.checkIn, { zone: 'Africa/Cairo' }) : null;
    const checkOut = this.checkOut ? DateTime.fromJSDate(this.checkOut, { zone: 'Africa/Cairo' }) : null;
    const date = DateTime.fromJSDate(this.date, { zone: 'Africa/Cairo' });
    // تحديد ما إذا كان اليوم إجازة أسبوعية
    const isWeeklyLeave = this.workDaysPerWeek === 5 && (date.weekday === 5 || date.weekday === 6) ||
                          this.workDaysPerWeek === 6 && date.weekday === 5;

    // اليوم ليس غيابًا إذا كان هناك بصمة صالحة أو إجازة أسبوعية
    this.absence = !(checkIn && checkIn.isValid) && !(checkOut && checkOut.isValid) && !isWeeklyLeave;

    // حساب ساعات العمل فقط إذا كان هناك تسجيلان صالحان
    if (checkIn && checkOut && checkIn.isValid && checkOut.isValid && checkOut > checkIn) {
      const diffMs = checkOut.toMillis() - checkIn.toMillis();
      const diffHours = diffMs / (1000 * 60 * 60);
      this.workHours = Math.min(diffHours, 8);
      this.overtime = diffHours > 8 ? diffHours - 8 : 0;
    } else {
      this.workHours = 0;
      this.overtime = 0;
    }

    // تحديد إذا كان التسجيل بصمة واحدة
    this.isSingleFingerprint = (checkIn && checkIn.isValid && (!checkOut || !checkOut.isValid)) ||
                              (checkOut && checkOut.isValid && (!checkIn || !checkIn.isValid));
  } catch (error) {
    console.error(`Error in calculateAttendance for code ${this.code}:`, error.message);
    this.absence = true;
    this.workHours = 0;
    this.overtime = 0;
    this.isSingleFingerprint = false;
  }
};

export default mongoose.model('Fingerprint', fingerprintSchema);
