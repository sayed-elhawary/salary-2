import mongoose from 'mongoose';
import { DateTime } from 'luxon';

const fingerprintSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'كود الموظف مطلوب'],
    trim: true,
  },
  date: {
    type: Date,
    required: [true, 'التاريخ مطلوب'],
  },
  checkIn: {
    type: Date,
    default: null,
  },
  checkOut: {
    type: Date,
    default: null,
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
  medicalLeave: {
    type: Boolean,
    default: false,
  },
  medicalLeaveDeduction: {
    type: Number,
    default: 0,
  },
  absence: {
    type: Boolean,
    default: false,
  },
  annualLeave: {
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

fingerprintSchema.index({ code: 1, date: 1 }, { unique: true });

const isWeeklyLeaveDay = (date, workDaysPerWeek) => {
  const dayOfWeek = DateTime.fromJSDate(date, { zone: 'Africa/Cairo' }).weekday;
  return (workDaysPerWeek === 5 && (dayOfWeek === 5 || dayOfWeek === 6)) ||
         (workDaysPerWeek === 6 && dayOfWeek === 5);
};

fingerprintSchema.methods.calculateAttendance = async function () {
  console.log(`Calculating attendance for ${this.code} on ${DateTime.fromJSDate(this.date).toISODate()}`);

  if (this.medicalLeave) {
    this.workHours = 0;
    this.overtime = 0;
    this.lateMinutes = 0;
    this.lateDeduction = 0;
    this.earlyLeaveDeduction = 0;
    this.absence = false;
    this.annualLeave = false;
    this.isSingleFingerprint = false;
    this.medicalLeaveDeduction = 0.25;
    console.log(`Medical leave applied for ${this.code}: medicalLeaveDeduction=0.25`);
    return;
  }

  if (this.annualLeave) {
    this.workHours = 0;
    this.overtime = 0;
    this.lateMinutes = 0;
    this.lateDeduction = 0;
    this.earlyLeaveDeduction = 0;
    this.absence = false;
    this.isSingleFingerprint = false;
    this.medicalLeaveDeduction = 0;
    console.log(`Annual leave applied for ${this.code}: no deductions`);
    return;
  }

  if (isWeeklyLeaveDay(this.date, this.workDaysPerWeek)) {
    this.workHours = 0;
    this.overtime = 0;
    this.lateMinutes = 0;
    this.lateDeduction = 0;
    this.earlyLeaveDeduction = 0;
    this.absence = false;
    this.isSingleFingerprint = false;
    this.medicalLeaveDeduction = 0;
    console.log(`Weekly leave day for ${this.code}: no deductions`);
    return;
  }

  if (!this.checkIn && !this.checkOut) {
    this.workHours = 0;
    this.overtime = 0;
    this.lateMinutes = 0;
    this.lateDeduction = 0;
    this.earlyLeaveDeduction = this.absence ? 1 : 0;
    this.medicalLeaveDeduction = 0;
    this.isSingleFingerprint = false;
    this.absence = true;
    console.log(`Absence recorded for ${this.code}: earlyLeaveDeduction=${this.earlyLeaveDeduction}`);
    return;
  }

  this.isSingleFingerprint = !(this.checkIn && this.checkOut);
  if (this.checkIn && this.checkOut) {
    const checkIn = DateTime.fromJSDate(this.checkIn, { zone: 'Africa/Cairo' });
    const checkOut = DateTime.fromJSDate(this.checkOut, { zone: 'Africa/Cairo' });
    if (!checkIn.isValid || !checkOut.isValid) {
      this.workHours = 0;
      this.overtime = 0;
      this.lateMinutes = 0;
      this.lateDeduction = 0;
      this.earlyLeaveDeduction = 0;
      this.medicalLeaveDeduction = 0;
      this.absence = false;
      console.warn(`Invalid checkIn or checkOut time for ${this.code}`);
      return;
    }

    const diffMs = checkOut.toMillis() - checkIn.toMillis();
    const hours = diffMs / (1000 * 60 * 60);
    this.workHours = Math.max(Math.min(hours, 8), 0);
    this.overtime = hours > 8 ? hours - 8 : 0;
    this.medicalLeaveDeduction = 0;
    this.absence = false;
    console.log(`Attendance calculated for ${this.code}: workHours=${this.workHours}, overtime=${this.overtime}`);
  } else {
    this.workHours = 0;
    this.overtime = 0;
    this.medicalLeaveDeduction = 0;
    this.absence = false;
    console.log(`Single fingerprint recorded for ${this.code}: no work hours`);
  }
};

fingerprintSchema.pre('save', function (next) {
  if (this.isModified('absence')) {
    console.log(`Absence changed for ${this.code} on ${DateTime.fromJSDate(this.date).toISODate()}: ${this.absence}`);
  }
  if (this.isModified('annualLeave')) {
    console.log(`Annual leave changed for ${this.code} on ${DateTime.fromJSDate(this.date).toISODate()}: ${this.annualLeave}`);
  }
  if (this.isModified('earlyLeaveDeduction')) {
    console.log(`Early leave deduction changed for ${this.code} on ${DateTime.fromJSDate(this.date).toISODate()}: ${this.earlyLeaveDeduction}`);
  }
  next();
});

// التحقق من وجود النموذج قبل تعريفه
const Fingerprint = mongoose.models.Fingerprint || mongoose.model('Fingerprint', fingerprintSchema);

export default Fingerprint;
