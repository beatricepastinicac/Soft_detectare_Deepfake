const mysql = require('mysql2');


const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',  
  database: 'deepfakedetection',  
  port: 3306,
});

const promisePool = pool.promise();


promisePool.getConnection((err, connection) => {
  if (err) {
    console.error('Eroare la conectarea la baza de date:');
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('Conexiunea la baza de date a fost pierdută.');
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
      console.error('Prea multe conexiuni deschise către baza de date.');
    }
    if (err.code === 'ECONNREFUSED') {
      console.error('Conexiunea la baza de date a fost refuzată.');
    }
    process.exit(1);  
  } else {
    console.log('Conexiunea la baza de date a fost realizată cu succes.');
    connection.release();
  }
});

module.exports = promisePool;
