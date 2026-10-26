/**
 * StudyTrack Pro - Student Task & Assignment Manager
 * Backend Server: Express.js, Node.js, MySQL (with Resilient Dual-Engine Fallback)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Path for resilient JSON file fallback (uses /tmp on Vercel to allow writes)
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'studytrack-data') : path.join(__dirname, 'data');
const JSON_FILE_PATH = path.join(DATA_DIR, 'tasks.json');

// Ensure data folder and file exists for fallback
function ensureFallbackData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(JSON_FILE_PATH)) {
      const templatePath = path.join(__dirname, 'data', 'tasks.json');
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, JSON_FILE_PATH);
      } else {
        fs.writeFileSync(JSON_FILE_PATH, JSON.stringify([], null, 2));
      }
    }
  } catch (err) {
    console.error('Error preparing fallback storage:', err.message);
  }
}
ensureFallbackData();

// Helper to read tasks from JSON
function readTasksFromJSON() {
  try {
    ensureFallbackData();
    const data = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading JSON fallback:', err.message);
    return [];
  }
}

// Helper to write tasks to JSON
function writeTasksToJSON(tasks) {
  try {
    ensureFallbackData();
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(tasks, null, 2));
  } catch (err) {
    console.error('Error writing JSON fallback:', err.message);
  }
}

// ==========================================
// DATABASE ENGINE CONFIGURATION
// ==========================================
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'studytrack_db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 2000
};

let dbMode = 'uninitialized'; // 'mysql' or 'fallback'
let pool = null;

// Initialize Database Connection
async function initDatabase() {
  try {
    // Attempt MySQL connection
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    
    // Auto-create database table if not present
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'Assignment',
        due_date DATE NOT NULL,
        priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
        status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Check if table is empty; if so, seed from JSON
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM tasks');
    if (rows[0].count === 0) {
      const initialTasks = readTasksFromJSON();
      for (const t of initialTasks) {
        await connection.query(
          `INSERT INTO tasks (title, subject, category, due_date, priority, status, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.title, t.subject, t.category || 'Assignment', t.due_date, t.priority || 'medium', t.status || 'pending', t.description || '']
        );
      }
      console.log('🌱 MySQL database initialized with initial seed tasks');
    }

    connection.release();
    dbMode = 'mysql';
    console.log(`✅ Connected successfully to MySQL (${dbConfig.database}@${dbConfig.host}:${dbConfig.port})`);
  } catch (err) {
    dbMode = 'fallback';
    console.warn(`⚠️ MySQL Connection unavailable (${err.message}). Using Resilient File-Backed Storage.`);
  }
}

// Kick off DB connection
initDatabase();

// ==========================================
// REST API ROUTES
// ==========================================

// Health & Engine Status API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'StudyTrack Pro',
    engine: dbMode,
    isVercel: IS_VERCEL,
    timestamp: new Date().toISOString()
  });
});

// GET /api/stats - Summary statistics
app.get('/api/stats', async (req, res) => {
  try {
    if (dbMode === 'mysql') {
      const [all] = await pool.query('SELECT COUNT(*) as total FROM tasks');
      const [pending] = await pool.query("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'");
      const [completed] = await pool.query("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'");
      const [high] = await pool.query("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending' AND priority = 'high'");
      
      const total = all[0].total;
      const completedCount = completed[0].count;
      const pendingCount = pending[0].count;
      const rate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

      return res.json({
        total,
        pending: pendingCount,
        completed: completedCount,
        highPriorityPending: high[0].count,
        completionRate: rate
      });
    } else {
      const tasks = readTasksFromJSON();
      const total = tasks.length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const pending = tasks.filter(t => t.status === 'pending').length;
      const high = tasks.filter(t => t.status === 'pending' && t.priority === 'high').length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return res.json({
        total,
        pending,
        completed,
        highPriorityPending: high,
        completionRate: rate
      });
    }
  } catch (err) {
    console.error('Error in /api/stats:', err);
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

// GET /api/tasks - Retrieve all tasks with optional filters
app.get('/api/tasks', async (req, res) => {
  try {
    const { status, subject, priority, search, category } = req.query;

    if (dbMode === 'mysql') {
      let query = 'SELECT * FROM tasks WHERE 1=1';
      const params = [];

      if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }
      if (subject && subject !== 'all') {
        query += ' AND subject = ?';
        params.push(subject);
      }
      if (priority && priority !== 'all') {
        query += ' AND priority = ?';
        params.push(priority);
      }
      if (category && category !== 'all') {
        query += ' AND category = ?';
        params.push(category);
      }
      if (search && search.trim() !== '') {
        query += ' AND (title LIKE ? OR subject LIKE ? OR description LIKE ?)';
        const term = `%${search.trim()}%`;
        params.push(term, term, term);
      }

      query += ' ORDER BY due_date ASC, id DESC';
      const [rows] = await pool.query(query, params);
      
      // Format due_date as YYYY-MM-DD
      const formatted = rows.map(r => ({
        ...r,
        due_date: r.due_date instanceof Date ? r.due_date.toISOString().split('T')[0] : r.due_date
      }));

      return res.json(formatted);
    } else {
      let tasks = readTasksFromJSON();

      if (status && status !== 'all') {
        tasks = tasks.filter(t => t.status === status);
      }
      if (subject && subject !== 'all') {
        tasks = tasks.filter(t => t.subject.toLowerCase() === subject.toLowerCase());
      }
      if (priority && priority !== 'all') {
        tasks = tasks.filter(t => t.priority === priority);
      }
      if (category && category !== 'all') {
        tasks = tasks.filter(t => (t.category || 'Assignment').toLowerCase() === category.toLowerCase());
      }
      if (search && search.trim() !== '') {
        const q = search.trim().toLowerCase();
        tasks = tasks.filter(t =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.subject && t.subject.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q))
        );
      }

      // Sort by due date ascending
      tasks.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
      return res.json(tasks);
    }
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

// GET /api/tasks/:id - Get single task
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) return res.status(400).json({ error: 'Invalid task ID' });

    if (dbMode === 'mysql') {
      const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
      const row = rows[0];
      row.due_date = row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date;
      return res.json(row);
    } else {
      const tasks = readTasksFromJSON();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      return res.json(task);
    }
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /api/tasks - Create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, subject, category, due_date, priority, description } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!due_date) {
      return res.status(400).json({ error: 'Due date is required' });
    }

    const cleanTitle = title.trim();
    const cleanSubject = subject.trim();
    const cleanCategory = category && category.trim() ? category.trim() : 'Assignment';
    const cleanPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
    const cleanDesc = description ? description.trim() : '';

    if (dbMode === 'mysql') {
      const [result] = await pool.query(
        `INSERT INTO tasks (title, subject, category, due_date, priority, status, description)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [cleanTitle, cleanSubject, cleanCategory, due_date, cleanPriority, cleanDesc]
      );

      const [newRow] = await pool.query('SELECT * FROM tasks WHERE id = ?', [result.insertId]);
      const task = newRow[0];
      task.due_date = task.due_date instanceof Date ? task.due_date.toISOString().split('T')[0] : task.due_date;
      return res.status(201).json({ message: 'Task created successfully', task });
    } else {
      const tasks = readTasksFromJSON();
      const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
      const newTask = {
        id: newId,
        title: cleanTitle,
        subject: cleanSubject,
        category: cleanCategory,
        due_date,
        priority: cleanPriority,
        status: 'pending',
        description: cleanDesc,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      tasks.unshift(newTask);
      writeTasksToJSON(tasks);
      return res.status(201).json({ message: 'Task created successfully', task: newTask });
    }
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PATCH /api/tasks/:id/toggle - Toggle task completed/pending status
app.patch('/api/tasks/:id/toggle', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) return res.status(400).json({ error: 'Invalid task ID' });

    if (dbMode === 'mysql') {
      const [current] = await pool.query('SELECT status FROM tasks WHERE id = ?', [taskId]);
      if (current.length === 0) return res.status(404).json({ error: 'Task not found' });

      const newStatus = current[0].status === 'completed' ? 'pending' : 'completed';
      await pool.query('UPDATE tasks SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, taskId]);

      const [updated] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
      const task = updated[0];
      task.due_date = task.due_date instanceof Date ? task.due_date.toISOString().split('T')[0] : task.due_date;
      return res.json({ message: `Task marked as ${newStatus}`, task });
    } else {
      const tasks = readTasksFromJSON();
      const index = tasks.findIndex(t => t.id === taskId);
      if (index === -1) return res.status(404).json({ error: 'Task not found' });

      tasks[index].status = tasks[index].status === 'completed' ? 'pending' : 'completed';
      tasks[index].updated_at = new Date().toISOString();
      writeTasksToJSON(tasks);
      return res.json({ message: `Task marked as ${tasks[index].status}`, task: tasks[index] });
    }
  } catch (err) {
    console.error('Error toggling task status:', err);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// PUT /api/tasks/:id - Update an existing task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) return res.status(400).json({ error: 'Invalid task ID' });

    const { title, subject, category, due_date, priority, status, description } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!due_date) return res.status(400).json({ error: 'Due date is required' });

    const cleanTitle = title.trim();
    const cleanSubject = subject.trim();
    const cleanCategory = category && category.trim() ? category.trim() : 'Assignment';
    const cleanPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
    const cleanStatus = ['pending', 'completed'].includes(status) ? status : 'pending';
    const cleanDesc = description ? description.trim() : '';

    if (dbMode === 'mysql') {
      const [result] = await pool.query(
        `UPDATE tasks 
         SET title = ?, subject = ?, category = ?, due_date = ?, priority = ?, status = ?, description = ?, updated_at = NOW()
         WHERE id = ?`,
        [cleanTitle, cleanSubject, cleanCategory, due_date, cleanPriority, cleanStatus, cleanDesc, taskId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Task not found' });

      const [updated] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
      const task = updated[0];
      task.due_date = task.due_date instanceof Date ? task.due_date.toISOString().split('T')[0] : task.due_date;
      return res.json({ message: 'Task updated successfully', task });
    } else {
      const tasks = readTasksFromJSON();
      const index = tasks.findIndex(t => t.id === taskId);
      if (index === -1) return res.status(404).json({ error: 'Task not found' });

      tasks[index] = {
        ...tasks[index],
        title: cleanTitle,
        subject: cleanSubject,
        category: cleanCategory,
        due_date,
        priority: cleanPriority,
        status: cleanStatus,
        description: cleanDesc,
        updated_at: new Date().toISOString()
      };
      writeTasksToJSON(tasks);
      return res.json({ message: 'Task updated successfully', task: tasks[index] });
    }
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) return res.status(400).json({ error: 'Invalid task ID' });

    if (dbMode === 'mysql') {
      const [result] = await pool.query('DELETE FROM tasks WHERE id = ?', [taskId]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Task not found' });
      return res.json({ message: 'Task deleted successfully', id: taskId });
    } else {
      const tasks = readTasksFromJSON();
      const index = tasks.findIndex(t => t.id === taskId);
      if (index === -1) return res.status(404).json({ error: 'Task not found' });

      tasks.splice(index, 1);
      writeTasksToJSON(tasks);
      return res.json({ message: 'Task deleted successfully', id: taskId });
    }
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// POST /api/tasks/seed - Reset demo data
app.post('/api/tasks/seed', async (req, res) => {
  try {
    const defaultData = [
      {
        title: 'Calculus Homework Chapter 4',
        subject: 'Mathematics',
        category: 'Assignment',
        due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        priority: 'high',
        status: 'pending',
        description: 'Complete problem sets 4.1 to 4.5 on differential equations.'
      },
      {
        title: 'Read Clean Code Chapters 1-3',
        subject: 'Software Engineering',
        category: 'Book',
        due_date: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
        priority: 'medium',
        status: 'pending',
        description: 'Read foundational principles of clean architecture and meaningful names.'
      },
      {
        title: 'Physics Lab Report: Optics',
        subject: 'Physics',
        category: 'Assignment',
        due_date: new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0],
        priority: 'high',
        status: 'pending',
        description: 'Submit lab observation report with refractive index calculations.'
      },
      {
        title: 'Database Normalization Quiz Prep',
        subject: 'Database Systems',
        category: 'Exam',
        due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        priority: 'medium',
        status: 'pending',
        description: 'Review 1NF, 2NF, 3NF and BCNF normalization rules and examples.'
      },
      {
        title: 'Biology Research Proposal Draft',
        subject: 'Biology',
        category: 'Project',
        due_date: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
        priority: 'low',
        status: 'completed',
        description: 'Finalize proposal draft on cellular respiration mechanisms.'
      },
      {
        title: 'Linear Algebra Matrix Quiz Review',
        subject: 'Mathematics',
        category: 'Daily Task',
        due_date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
        priority: 'medium',
        status: 'completed',
        description: 'Reviewed eigenvalues, eigenvectors, and Gaussian elimination.'
      }
    ];

    if (dbMode === 'mysql') {
      await pool.query('TRUNCATE TABLE tasks');
      for (const t of defaultData) {
        await pool.query(
          `INSERT INTO tasks (title, subject, category, due_date, priority, status, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.title, t.subject, t.category, t.due_date, t.priority, t.status, t.description]
        );
      }
    } else {
      const seeded = defaultData.map((t, idx) => ({
        id: idx + 1,
        ...t,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      writeTasksToJSON(seeded);
    }

    res.json({ message: 'Default student tasks successfully reseeded!' });
  } catch (err) {
    console.error('Error reseeding:', err);
    res.status(500).json({ error: 'Failed to reset demo data' });
  }
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server if run directly (not serverless wrapped)
if (process.env.NODE_ENV !== 'test' && !IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 StudyTrack Pro Server running on port ${PORT}`);
    console.log(`📡 Local URL: http://localhost:${PORT}`);
    console.log(`💾 Database Engine: ${dbMode}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
