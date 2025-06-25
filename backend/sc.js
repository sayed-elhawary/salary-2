const cleanDuplicates = async () => {
  const duplicates = await Fingerprint.aggregate([
    { $group: { _id: { code: "$code", date: "$date" }, count: { $sum: 1 }, docs: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  for (const dup of duplicates) {
    const [keep, ...remove] = dup.docs;
    await Fingerprint.deleteMany({ _id: { $in: remove } });
    console.log(`Kept ${keep}, removed ${remove.length} duplicates for ${dup._id.code} on ${dup._id.date}`);
  }
};
