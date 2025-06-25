const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// إعدادات Middleware
app.use(cors());
app.use(express.json());

// الاتصال بـ MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('تم الاتصال بقاعدة بيانات MongoDB');
}).catch((err) => {
  console.error('فشل الاتصال بـ MongoDB:', err);
});

// تعريف Schema للموظفين
const UserSchema = new mongoose.Schema({
  name: String,
  baseSalary: Number,
  bonuses: Number,
  deductions: Number,
  role: String,
});

const User = mongoose.model('User', UserSchema);

// تعريف Schema للحضور
const AttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: Date,
  status: String,
});

const Attendance = mongoose.model('Attendance', AttendanceSchema);

// Middleware للتوثيق بـ JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'التوثيق مطلوب' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'التوكن غير صالح' });
    req.user = user;
    next();
  });
};

// Endpoint لجلب تقرير المرتبات
app.get('/api/reports/salary', authenticateToken, async (req, res) => {
  try {
    // التحقق من إن المستخدم أدمن
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'ممنوع: الأدمن فقط يمكنه عرض التقارير' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'يرجى إدخال تاريخ البداية والنهاية' });
    }

    // جلب الموظفين
    const users = await User.find();
    const reports = [];

    for (const user of users) {
      // جلب سجلات الحضور في النطاق الزمني
      const attendance = await Attendance.find({
        userId: user._id,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
      });

      // حساب الحضور والغياب
      const presentDays = attendance.filter(a => a.status === 'present').length;
      const absentDays = attendance.filter(a => a.status === 'absent').length;

      // حساب صافي المرتب (مثال بسيط)
      const dailyRate = user.baseSalary / 30; // افتراض 30 يوم عمل
      const netSalary = user.baseSalary + (user.bonuses || 0) - (user.deductions || 0) - (absentDays * dailyRate);

      reports.push({
        employeeName: user.name,
        baseSalary: user.baseSalary,
        bonuses: user.bonuses || 0,
        deductions: user.deductions || 0,
        netSalary: netSalary.toFixed(2),
        presentDays,
        absentDays,
      });
    }

    res.json(reports);
  } catch (err) {
    console.error('خطأ في جلب التقرير:', err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// تشغيل الخادم
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`خدمة التقارير تعمل على بورت ${PORT}`);
});
