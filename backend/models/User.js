import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';

// تعريف نموذج المستخدم (User Schema)
const userSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'كود الموظف مطلوب'],
      unique: true,
      trim: true,
      minlength: [3, 'كود الموظف يجب أن يكون 3 أحرف على الأقل'],
      maxlength: [10, 'كود الموظف يجب ألا يتجاوز 10 أحرف'],
    },
    fullName: {
      type: String,
      required: [true, 'الاسم الكامل مطلوب'],
      trim: true,
      minlength: [2, 'الاسم الكامل يجب أن يكون حرفين على الأقل'],
      maxlength: [50, 'الاسم الكامل يجب ألا يتجاوز 50 حرفًا'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'البريد الإلكتروني غير صالح'],
      unique: true,
      sparse: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?\d{10,15}$/, 'رقم الهاتف غير صالح'],
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
    monthlyLateAllowance: {
      type: Number,
      default: 120,
      min: [0, 'رصيد السماح الشهري يجب ألا يكون سالبًا'],
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

// إضافة فهرس على الحقل code لتحسين أداء البحث
userSchema.index({ code: 1 });

// حقل افتراضي لحساب الراتب الصافي
userSchema.virtual('netSalary').get(function () {
  return this.baseSalary - this.medicalInsurance - this.socialInsurance;
});

// تشفير كلمة المرور قبل الحفظ
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// إعادة تعيين رصيد السماح الشهري إذا تغير الشهر
userSchema.pre('save', async function (next) {
  const now = DateTime.now().setZone('Africa/Cairo');
  const lastReset = this.lastResetDate
    ? DateTime.fromJSDate(this.lastResetDate, { zone: 'Africa/Cairo' })
    : now;

  if (now.month !== lastReset.month || now.year !== lastReset.year) {
    this.monthlyLateAllowance = 120;
    this.lastResetDate = now.startOf('month').toJSDate();
  }

  next();
});

// دالة للتحقق من كلمة المرور
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
