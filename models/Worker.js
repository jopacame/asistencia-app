const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dni: { type: String, default: '' },
  email: { type: String, default: '' },
  celular: { type: String, default: '' },
  cargo: { type: String, default: 'Trabajador' },
  photo: { type: String, default: '' },
  photoData: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

workerSchema.index({ name: 1 });

module.exports = mongoose.model('Worker', workerSchema);
