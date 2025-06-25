router.get('/', async (req, res) => {
  try {
    const employees = await Employee.find({}, 'code name');
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
