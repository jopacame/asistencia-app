require('dotenv').config();
const dns = require('dns');
const dnsServers = dns.getServers();
if (dnsServers.length === 1 && dnsServers[0] === '127.0.0.1') {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
}
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Worker = require('./models/Worker');
const Attendance = require('./models/Attendance');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/asistencia';

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'asistencia.html'));
});

const DATA_DIR = path.join(__dirname, 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const ATTENDANCE_PHOTOS_DIR = path.join(DATA_DIR, 'attendance_photos');

try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch (e) {}
try { if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR); } catch (e) {}
try { if (!fs.existsSync(ATTENDANCE_PHOTOS_DIR)) fs.mkdirSync(ATTENDANCE_PHOTOS_DIR); } catch (e) {}

try { app.use('/photos', express.static(PHOTOS_DIR)); } catch (e) {}
try { app.use('/attendance_photos', express.static(ATTENDANCE_PHOTOS_DIR)); } catch (e) {}

async function migrateFromJSON() {
  const WORKERS_FILE = path.join(DATA_DIR, 'workers.json');
  const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
  if (!fs.existsSync(WORKERS_FILE) && !fs.existsSync(ATTENDANCE_FILE)) return;
  if (await Worker.countDocuments() > 0 || await Attendance.countDocuments() > 0) return;
  const idMap = {};
  if (fs.existsSync(WORKERS_FILE)) {
    const workers = JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf8'));
    for (const w of workers) {
      const doc = await Worker.create({
        name: w.name, dni: w.dni || '', email: w.email || '',
        celular: w.celular || '', cargo: w.cargo || 'Trabajador',
        photo: w.photo || '', createdAt: w.createdAt || new Date()
      });
      idMap[w.id] = doc._id.toString();
    }
    console.log(`  Migrados ${workers.length} trabajadores desde JSON`);
  }
  if (fs.existsSync(ATTENDANCE_FILE)) {
    const records = JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf8'));
    for (const r of records) {
      const newWorkerId = idMap[r.workerId] || r.workerId;
      await Attendance.create({
        workerId: newWorkerId, date: r.date,
        entryTime: r.entryTime || '', exitTime: r.exitTime || '',
        entryStatus: r.entryStatus || '', exitStatus: r.exitStatus || '',
        entryPhoto: r.entryPhoto || '', exitPhoto: r.exitPhoto || '',
        location: r.location || '', latlng: r.latlng || ''
      });
    }
    console.log(`  Migrados ${records.length} registros de asistencia desde JSON`);
  }
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
  }
});

app.get('/api/workers', async (req, res) => {
  const workers = await Worker.find().sort({ name: 1 });
  res.json(workers.map(w => ({ ...w.toObject(), id: w._id.toString() })));
});

app.post('/api/workers', async (req, res) => {
  const { name, dni, email, celular, cargo } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const exists = await Worker.findOne({ name: { $regex: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
  if (exists) return res.status(400).json({ error: 'Ya existe un trabajador con ese nombre' });
  const worker = await Worker.create({ name, dni: dni || '', email: email || '', celular: celular || '', cargo: cargo || 'Trabajador' });
  res.status(201).json({ ...worker.toObject(), id: worker._id.toString() });
});

app.patch('/api/workers/:id', async (req, res) => {
  if (req.body.name) {
    const dup = await Worker.findOne({ _id: { $ne: req.params.id }, name: { $regex: new RegExp('^' + req.body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
    if (dup) return res.status(400).json({ error: 'Ya existe otro trabajador con ese nombre' });
  }
  const worker = await Worker.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!worker) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ...worker.toObject(), id: worker._id.toString() });
});

app.delete('/api/workers/:id', async (req, res) => {
  const worker = await Worker.findByIdAndDelete(req.params.id);
  if (worker && worker.photo) {
    const fp = path.join(PHOTOS_DIR, worker.photo);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  res.json({ success: true });
});

app.post('/api/attendance', async (req, res) => {
  const { workerId, date, type, time, location, latlng, entryPhoto, exitPhoto } = req.body;
  if (!workerId || !date || !type) return res.status(400).json({ error: 'Faltan datos' });
  let record = await Attendance.findOne({ workerId, date });
  if (!record) record = new Attendance({ workerId, date });
  const [h, m] = (time || '00:00').split(':').map(Number);
  const mins = h * 60 + m;
  if (type === 'entry') {
    record.entryTime = time;
    record.entryStatus = mins <= 480 ? 'puntual' : 'tardanza';
    if (entryPhoto) record.entryPhoto = entryPhoto;
  } else if (type === 'exit') {
    record.exitTime = time;
    if (mins >= 990 && mins <= 1020) record.exitStatus = 'normal';
    else if (mins > 1020) record.exitStatus = 'fuera_horario';
    else record.exitStatus = 'anticipado';
    if (exitPhoto) record.exitPhoto = exitPhoto;
  }
  if (location) record.location = location;
  if (latlng) record.latlng = latlng;
  await record.save();
  res.json(record.toObject());
});

app.get('/api/attendance', async (req, res) => {
  const { date } = req.query;
  const filter = date ? { date } : {};
  const records = await Attendance.find(filter);
  res.json(records);
});

app.get('/api/attendance/history', async (req, res) => {
  const { date } = req.query;
  const filter = date ? { date } : {};
  const records = await Attendance.find(filter).sort({ date: -1 });
  const workerIds = [...new Set(records.map(r => r.workerId.toString()))];
  const workers = await Worker.find({ _id: { $in: workerIds } });
  const workerMap = {};
  workers.forEach(w => { workerMap[w._id.toString()] = w.name; });
  const enriched = records.map(r => ({
    ...r.toObject(), id: r._id.toString(),
    workerName: workerMap[r.workerId.toString()] || 'Desconocido'
  }));
  res.json(enriched);
});

app.patch('/api/attendance/:workerId/:date', async (req, res) => {
  const record = await Attendance.findOne({ workerId: req.params.workerId, date: req.params.date });
  if (!record) return res.status(404).json({ error: 'No encontrado' });
  const allowed = ['entryTime', 'exitTime', 'entryStatus', 'exitStatus'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) record[key] = req.body[key];
  }
  await record.save();
  res.json(record.toObject());
});

app.delete('/api/attendance/:workerId/:date', async (req, res) => {
  const record = await Attendance.findOneAndDelete({ workerId: req.params.workerId, date: req.params.date });
  if (record) {
    [record.entryPhoto, record.exitPhoto].forEach(f => {
      if (f) { const fp = path.join(ATTENDANCE_PHOTOS_DIR, f); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
    });
  }
  res.json({ success: true });
});

app.post('/api/upload', async (req, res) => {
  const { image, workerId } = req.body;
  if (!image) return res.status(400).json({ error: 'Imagen requerida' });
  const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Formato inválido' });
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `${workerId}_${Date.now()}.${ext}`;
  try { fs.writeFileSync(path.join(PHOTOS_DIR, filename), data); } catch (e) {}
  try { await Worker.findByIdAndUpdate(workerId, { photoData: image }); } catch (e) {}
  res.json({ filename });
});

app.delete('/api/upload/:filename', (req, res) => {
  const filePath = path.join(PHOTOS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

app.post('/api/attendance/upload', async (req, res) => {
  const { image, workerId, date, type } = req.body;
  if (!image) return res.status(400).json({ error: 'Imagen requerida' });
  const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Formato inválido' });
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `${workerId}_${date}_${type}_${Date.now()}.${ext}`;
  try { fs.writeFileSync(path.join(ATTENDANCE_PHOTOS_DIR, filename), data); } catch (e) {}
  const updateField = type === 'entry' ? { entryPhotoData: image } : { exitPhotoData: image };
  try { await Attendance.findOneAndUpdate({ workerId, date }, updateField); } catch (e) {}
  res.json({ filename });
});

app.delete('/api/attendance/upload/:filename', (req, res) => {
  const filePath = path.join(ATTENDANCE_PHOTOS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

mongoose.connect(MONGO_URI).then(async () => {
  console.log('  ✅ Conectado a MongoDB');
  await migrateFromJSON();
}).then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    const local = getLocalIP();
    console.log(`\n  ✅ AsistenciaApp lista`);
    console.log(`  📍 Red local:    http://${local}:${PORT}`);
    console.log(`  🏠 Localhost:    http://localhost:${PORT}`);
    console.log(`  ☁️  Cloud:        Despliega en Render.com desde GitHub`);
    console.log(`  📱 PWA:          Abre desde el celular e instala en pantalla de inicio\n`);
  });
}).catch(err => {
  console.error('  ❌ Error de conexión a MongoDB:', err.message);
  process.exit(1);
});
