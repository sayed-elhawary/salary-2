import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import Fingerprint from './Fingerprint.js'; // استيراد من نفس المجلد models

const userSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'كود الموظف مطلوب'],
      unique: true,
      trim: true,
      maxlength: [10, 'كود الموظف يجب ألا يتجاوز 10 أحرف'],
    },
    fullName: {
      type: String,
      required: [true, 'الاسم الكامل مطلوب'],
      trim: true,
      minlength: [2, 'الاسم الكامل يجب أن يكون حرفين على الأقل'],
      maxlength: [50, 'الاسم الكامل يجب ألا يتجاوز 50 حرفًا'],
    },
    password: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة'],
      minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'user'],
        message: 'الدور يجب أن يكون إما admin أو user',
      },
      default: 'user',
    },
    department: {
      type: String,
      required: [true, 'القسم مطلوب'],
      trim: true,
    },
    baseSalary: {
      type: Number,
      required: [true, 'الراتب الأساسي مطلوب'],
      min: [0, 'الراتب الأساسي يجب ألا يكون سالبًا'],
    },
    baseBonus: {
      type: Number,
      default: 0,
      min: [0, 'المكافأة الأساسية يجب ألا تكون سالبة'],
    },
    bonusPercentage: {
      type: Number,
      required: [true, 'نسبة المكافأة مطلوبة'],
      min: [0, 'نسبة المكافأة يجب ألا تكون سالبة'],
      max: [100, 'نسبة المكافأة يجب ألا تتجاوز 100%'],
    },
    mealAllowance: {
      type: Number,
      default: 500,
      min: [0, 'بدل الوجبة يجب ألا يكون سالبًا'],
    },
    medicalInsurance: {
      type: Number,
      default: 0,
      min: [0, 'التأمين الطبي يجب ألا يكون سالبًا'],
    },
    socialInsurance: {
      type: Number,
      default: 0,
      min: [0, 'التأمين الاجتماعي يجب ألا يكون سالبًا'],
    },
    eidBonus: {
      type: Number,
      default: 0,
      min: [0, 'عيدية العيد يجب ألا تكون سالبة'],
    },
    workDaysPerWeek: {
      type: Number,
      enum: {
        values: [5, 6],
        message: 'أيام العمل يجب أن تكون إما 5 أو 6 أيام',
      },
      default: 5,
      required: [true, 'عدد أيام العمل الأسبوعية مطلوب'],
    },
    annualLeaveBalance: {
      type: Number,
      default: 21,
      min: [0, 'رصيد الإجازة السنوية يجب ألا يكون سالبًا'],
    },
    totalAnnualLeave: {
      type: Number,
      default: 0,
      min: [0, 'إجمالي أيام الإجازة السنوية يجب ألا يكون سالبًا'],
    },
    monthlyLateAllowance: {
      type: Number,
      default: 120,
      min: [0, 'رصيد السماح الشهري يجب ألا يكون سالبًا'],
    },
    penaltiesValue: {
      type: Number,
      default: 0,
      min: [0, 'قيمة الجزاءات يجب ألا تكون سالبة'],
    },
    violationsInstallment: {
      type: Number,
      default: 0,
      min: [0, 'قسط المخالفات يجب ألا يكون سالبًا'],
    },
    totalViolationsValue: {
      type: Number,
      default: 0,
      min: [0, 'إجمالي قيمة المخالفات يجب ألا تكون سالبة'],
    },
    lastResetDate: {
      type: Date,
      default: () => DateTime.now().setZone('Africa/Cairo').startOf('month').toJSDate(),
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended'],
        message: 'الحالة يجب أن تكون active أو inactive أو suspended',
      },
      default: 'active',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ code: 1 });

// Middleware لتشفير كلمة المرور وإعادة تعيين رصيد التأخير الشهري
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      console.log(`Password hashed for user: ${this.code}`);
    } catch (err) {
      console.error(`Error hashing password for user ${this.code}:`, err.message);
      return next(err);
    }
  }

  if (this.isModified('violationsInstallment')) {
    console.log(`Updating violationsInstallment for user ${this.code}: Previous=${this.get('violationsInstallment', null, { getters: false })}, New=${this.violationsInstallment}`);
  }

  if (this.isModified('totalAnnualLeave') || this.isModified('annualLeaveBalance')) {
    console.log(`Updating leave for user ${this.code}: totalAnnualLeave=${this.totalAnnualLeave}, annualLeaveBalance=${this.annualLeaveBalance}`);
  }

  const now = DateTime.now().setZone('Africa/Cairo');
  const lastReset = this.lastResetDate
    ? DateTime.fromJSDate(this.lastResetDate, { zone: 'Africa/Cairo' })
    : now;

  if (now.month !== lastReset.month || now.year !== lastReset.year) {
    this.monthlyLateAllowance = 120;
    this.lastResetDate = now.startOf('month').toJSDate();
    console.log(`Reset monthlyLateAllowance for user ${this.code} to 120 on ${this.lastResetDate}`);
  }

  next();
});

// دالة لمقارنة كلمة المرور
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// حقل افتراضي لحساب الراتب الصافي
userSchema.virtual('netSalary').get(async function () {
  try {
    const startDate = DateTime.now().setZone('Africa/Cairo').startOf('month').toJSDate();
    const endDate = DateTime.now().setZone('Africa/Cairo').endOf('month').toJSDate();

    const fingerprints = await Fingerprint.find({
      code: this.code,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    const totals = fingerprints.reduce(
      (acc, report) => {
        const isWorkDay = !report.absence && !report.annualLeave && !report.medicalLeave && !isWeeklyLeaveDay(report.date, this.workDaysPerWeek);
        acc.totalWorkHours += report.workHours || 0;
        acc.totalWorkDays += isWorkDay ? 1 : 0;
        acc.totalAbsenceDays += report.absence ? 1 : 0;
        acc.lateDeductionDays += report.lateDeduction || 0;
        acc.earlyLeaveDeductionDays += report.earlyLeaveDeduction || 0;
        acc.medicalLeaveDeductionDays += report.medicalLeaveDeduction || 0;
        acc.totalOvertime += report.overtime || 0;
        acc.totalWeeklyLeaveDays += isWeeklyLeaveDay(report.date, this.workDaysPerWeek) ? 1 : 0;
        acc.totalAnnualLeaveDays += report.annualLeave ? 1 : 0;
        acc.totalMedicalLeaveDays += report.medicalLeave ? 1 : 0;
        return acc;
      },
      {
        totalWorkHours: 0,
        totalWorkDays: 0,
        totalAbsenceDays: 0,
        lateDeductionDays: 0,
        earlyLeaveDeductionDays: 0,
        medicalLeaveDeductionDays: 0,
        totalOvertime: 0,
        totalWeeklyLeaveDays: 0,
        totalAnnualLeaveDays: 0,
        totalMedicalLeaveDays: 0,
      }
    );

    const dailySalary = this.baseSalary / 30;
    const hourlyRate = dailySalary / 9;
    const overtimeValue = totals.totalOvertime * hourlyRate;
    const baseMealAllowance = this.mealAllowance;
    const mealAllowance = baseMealAllowance - (totals.totalAbsenceDays + totals.totalAnnualLeaveDays + totals.totalMedicalLeaveDays) * 50;
    const bonus = this.baseBonus * (this.bonusPercentage / 100);
    const deductionsValue = (totals.totalAbsenceDays + totals.lateDeductionDays + totals.earlyLeaveDeductionDays + totals.medicalLeaveDeductionDays) * dailySalary + this.penaltiesValue + this.violationsInstallment;

    const netSalary = (
      this.baseSalary +
      mealAllowance +
      overtimeValue +
      bonus +
      this.eidBonus -
      this.medicalInsurance -
      this.socialInsurance -
      deductionsValue
    ).toFixed(2);

    console.log(`Calculated netSalary for ${this.code}: ${netSalary}, deductionsValue: ${deductionsValue}, violationsInstallment: ${this.violationsInstallment}`);
    return netSalary;
  } catch (error) {
    console.error(`Error calculating netSalary for user ${this.code}:`, error.message);
    return 0;
  }
});

// التحقق من وجود النموذج قبل تعريفه
const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;

// دالة مساعدة للتحقق من أيام الإجازة الأسبوعية
const isWeeklyLeaveDay = (date, workDaysPerWeek) => {
  const dayOfWeek = DateTime.fromJSDate(date, { zone: 'Africa/Cairo' }).weekday;
  return (workDaysPerWeek === 5 && (dayOfWeek === 5 || dayOfWeek === 6)) ||
         (workDaysPerWeek === 6 && dayOfWeek === 5);
};
