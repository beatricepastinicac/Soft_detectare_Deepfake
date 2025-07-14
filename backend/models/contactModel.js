const db = require('../db');

const createContactMessage = async (name, email, message) => {
  try {
    const sql = `INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, NOW())`;
    const [result] = await db.execute(sql, [name, email, message]);
    return result;
  } catch (error) {
    console.error('Eroare la crearea mesajului:', error);
    throw new Error('A apărut o eroare la crearea mesajului de contact.');
  }
};

const getAllContactMessages = async () => {
  try {
    const sql = `SELECT * FROM contacts ORDER BY created_at DESC`;
    const [rows] = await db.execute(sql);
    return rows;
  } catch (error) {
    console.error('Eroare la obținerea tuturor mesajelor de contact:', error);
    throw new Error('A apărut o eroare la obținerea mesajelor de contact.');
  }
};

const getContactMessageById = async (id) => {
  try {
    const sql = `SELECT * FROM contacts WHERE id = ?`;
    const [rows] = await db.execute(sql, [id]);
    if (rows.length === 0) {
      throw new Error(`Mesajul de contact cu ID-ul ${id} nu a fost găsit.`);
    }
    return rows[0];
  } catch (error) {
    console.error(`Eroare la obținerea mesajului de contact cu ID-ul ${id}:`, error);
    throw new Error('A apărut o eroare la obținerea mesajului de contact.');
  }
};

const deleteContactMessageById = async (id) => {
  try {
    const sql = `DELETE FROM contacts WHERE id = ?`;
    const [result] = await db.execute(sql, [id]);
    if (result.affectedRows === 0) {
      throw new Error(`Mesajul de contact cu ID-ul ${id} nu a fost găsit.`);
    }
    return { message: `Mesajul cu ID-ul ${id} a fost șters cu succes.` };
  } catch (error) {
    console.error(`Eroare la ștergerea mesajului de contact cu ID-ul ${id}:`, error);
    throw new Error('A apărut o eroare la ștergerea mesajului de contact.');
  }
};

module.exports = {
  createContactMessage,
  getAllContactMessages,
  getContactMessageById,
  deleteContactMessageById
};