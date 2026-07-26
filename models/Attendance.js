const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
  date: { type: String, required: true },
  entryTime: { type: String, default: '' },
  exitTime: { type: String, default: '' },
  entryStatus: { type: String, default: '' },
  exitStatus: { type: String, default: '' },
  entryPhoto: { type: String, default: '' },
  entryPhotoData: { type: String, default: '' },
  exitPhoto: { type: String, default: '' },
  exitPhotoData: { type: String, default: '' },
  location: { type: String, default: '' },
  latlng: { type: String, default: '' }
});

attendanceSchema.index({ workerId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
