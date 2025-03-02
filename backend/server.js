const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const path = require('path');
const db = require('./db');  
const analysisRoutes = require('./routes/analysis');
const contactRoutes = require('./routes/contactRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const reportRoutes = require('./routes/reportRoutes');
const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({ origin: 'http://localhost:3000' })); 
app.use(express.json());  
app.use(express.urlencoded({ extended: true }));  
app.use(fileUpload());  
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


db.getConnection((err, connection) => {
  if (err) {
    console.error('Eroare la conectarea la baza de date:', err);
    process.exit(1);  
  } else {
    console.log('Conexiune reușită la baza de date.');
    connection.release();  
  }
});


app.use('/api/analysis', analysisRoutes);  
app.use('/api/contact', contactRoutes);    
app.use('/api/media', mediaRoutes);       
app.use('/api/report', reportRoutes);      


app.listen(PORT, () => {
  console.log(`Serverul rulează pe http://localhost:${PORT}`);
});
