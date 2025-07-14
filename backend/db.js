const mysql = require('mysql2');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'deepfakedetection',
  port: process.env.DB_PORT || 3306,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

const pool = mysql.createPool(dbConfig);
const promisePool = pool.promise();

setInterval(() => {
  pool.query('SELECT 1', (err) => {
    if (err) {
      console.error('Error pinging database:', err);
    }
  });
}, 60000);

module.exports = promisePool;

console.log('Attempting to connect to MySQL database...');
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to database:');
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('Database connection was lost.');
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
      console.error('Database has too many connections.');
    }
    if (err.code === 'ECONNREFUSED') {
      console.error('Database connection was refused.');
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('Access denied. Check your username and password.');
    }
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('Database does not exist. Creating it...');
      
      const tempPool = mysql.createPool({
        ...dbConfig,
        database: undefined
      });
      
      tempPool.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`, (createErr) => {
        if (createErr) {
          console.error('Failed to create database:', createErr);
        } else {
          console.log(`Database '${dbConfig.database}' created successfully. Reconnecting...`);
          
          pool.getConnection((reconnectErr, reconnectConn) => {
            if (reconnectErr) {
              console.error('Error reconnecting to database:', reconnectErr);
            } else {
              console.log('Successfully reconnected to database');
              reconnectConn.release();
            }
          });
        }
        tempPool.end();
      });
    }
  } else {
    console.log('Successfully connected to database');
    
    connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(191) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        county VARCHAR(100),
        postal_code VARCHAR(20),
        company VARCHAR(191),
        position VARCHAR(191),
        newsletter BOOLEAN DEFAULT 0,
        role ENUM('user','admin','premium') DEFAULT 'user',
        tier ENUM('free','premium') DEFAULT 'free',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, (err) => {
      if (err) {
        console.error('Error creating users table:', err);
      } else {
        console.log('Users table checked/created');
      }
    });
    
    connection.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_name VARCHAR(191) NOT NULL,
        detection_result JSON,
        confidence_score FLOAT,
        fake_score FLOAT,
        user_id INT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        image_path VARCHAR(500),
        heatmap_path VARCHAR(500),
        faces_detected INT DEFAULT 0,
        face_score FLOAT,
        inconsistency_score FLOAT,
        vgg_face_score FLOAT,
        is_deepfake BOOLEAN DEFAULT FALSE,
        model_type VARCHAR(50) DEFAULT 'basic',
        std_deviation FLOAT,
        confidence_interval JSON,
        processing_time FLOAT,
        analysis_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, (err) => {
      if (err) {
        console.error('Error creating reports table:', err);
      } else {
        console.log('Reports table checked/created');
      }
    });
    
    connection.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        email VARCHAR(191) NOT NULL,
        message TEXT NOT NULL,
        source VARCHAR(50) DEFAULT 'web',
        is_read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, (err) => {
      if (err) {
        console.error('Error creating contacts table:', err);
      } else {
        console.log('Contacts table checked/created');
      }
    });
    
    connection.query(`
      CREATE TABLE IF NOT EXISTS media_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(191),
        file_size BIGINT,
        mime_type VARCHAR(100),
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, (err) => {
      if (err) {
        console.error('Error creating media_files table:', err);
      } else {
        console.log('Media_files table checked/created');
      }
    });
    
    connection.query(`
      CREATE TABLE IF NOT EXISTS statistics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        total_analyses INT DEFAULT 0,
        total_users INT DEFAULT 0,
        total_fake_detected INT DEFAULT 0,
        total_real_detected INT DEFAULT 0,
        avg_fake_score FLOAT DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, (err) => {
      if (err) {
        console.error('Error creating statistics table:', err);
      } else {
        console.log('Statistics table checked/created');
      }
    });
    
    connection.release();
  }
});