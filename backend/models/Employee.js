const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  department: { type: String, required: true },
  basicSalary: { type: Number, required: true },
  medicalInsurance: { type: Number, required: true },
  socialInsurance: { type: Number, required: true },
  annualLeaveBalance: { type: Number, default: 20 },
});

module.exports = mongoose.model('Employee', employeeSchema);
