import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');

    const adminData = {
      code: '3000',
      role: 'admin',
      bus: 'Default Bus',
      department: 'Administration',
      baseSalary: 5000,
      baseBonus: 1000,
      bonusPercentage: 10,
      medicalInsurance: true,
      socialInsurance: true,
      workDays: 5,
    };

    const existingAdmin = await User.findOne({ code: adminData.code });
    if (existingAdmin) {
      console.log(`Admin with code ${adminData.code} already exists`);
      await mongoose.connection.close();
      return;
    }

    const admin = new User(adminData);
    await admin.save();
    console.log(`Admin created successfully with code ${adminData.code}`);
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
