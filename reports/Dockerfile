# استخدام صورة Node.js
FROM node:16

# إعداد مجلد العمل
WORKDIR /app

# نسخ package.json وتثبيت التبعيات
COPY package*.json ./
RUN npm install

# نسخ باقي الملفات
COPY . .

# تعريض البورت
EXPOSE 5001

# الأمر لتشغيل الخدمة
CMD ["node", "reports_service.js"]
