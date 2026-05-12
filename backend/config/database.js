// src/config/database.js
// Konfigurasi koneksi database MySQL menggunakan Sequelize ORM

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
  }
);

// Test koneksi
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Koneksi database berhasil!');
  } catch (error) {
    console.error('❌ Gagal konek database:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, testConnection };
