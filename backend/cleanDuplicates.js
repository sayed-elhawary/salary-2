import mongoose from 'mongoose';
import Fingerprint from './models/Fingerprint.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// تحديد المسار الحالي للملف
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل ملف .env من المجلد الحالي
dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.MONGO_URI) {
  console.error('Error: MONGO_URI is not defined in .env file');
  process.exit(400);
}

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
  cleanDuplicates();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(400);
});

const cleanDuplicates = async () => {
  try {
    const duplicates = await Fingerprint.aggregate([
      { $group: { _id: { code: "$code", date: "$date" }, count: { $sum: 1 }, docs: { $push: "$$ROOT" } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicates.length === 0) {
      console.log('No duplicate records found');
    } else {
      for (const dup of duplicates) {
        // الاحتفاظ بالسجل الذي يحتوي على حضور أو انصراف
        const docs = dup.docs.sort((a, b) => {
          if (a.checkIn && a.checkOut) return -1;
          if (b.checkIn && b.checkOut) return 1;
          if (a.checkIn || a.checkOut) return -1;
          if (b.checkIn || a.checkOut) return 1;
          return 0;
        });
        const [keep, ...remove] = docs.map(doc => doc._id);
        await Fingerprint.deleteMany({ _id: { $in: remove } });
        console.log(`Kept ${keep}, removed ${remove.length} duplicates for ${dup._id.code} on ${dup._id.date}`);
      }
    }

    console.log('Duplicate cleanup completed');
    mongoose.disconnect();
  } catch (err) {
    console.error('Error cleaning duplicates:', err);
    mongoose.disconnect();
    process.exit(500);
  }
};
