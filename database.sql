-- ========================================================
-- StudyTrack Pro: Student Task & Assignment Manager Database
-- RDBMS: MySQL 8.0+ / MariaDB 10.4+
-- ========================================================

CREATE DATABASE IF NOT EXISTS studytrack_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE studytrack_db;

-- --------------------------------------------------------
-- Table: tasks
-- Stores student assignments, study tasks, and reading goals
-- --------------------------------------------------------
DROP TABLE IF EXISTS tasks;

CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL COMMENT 'Task or assignment title',
    subject VARCHAR(100) NOT NULL COMMENT 'Academic course or subject',
    category VARCHAR(50) NOT NULL DEFAULT 'Assignment' COMMENT 'Assignment, Book, Project, Exam, Daily Task',
    due_date DATE NOT NULL COMMENT 'Deadline date for the task',
    priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium' COMMENT 'Urgency level',
    status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending' COMMENT 'Current task status',
    description TEXT NULL COMMENT 'Optional notes or instructions',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Seed Data: Sample Initial Tasks
-- --------------------------------------------------------
INSERT INTO tasks (title, subject, category, due_date, priority, status, description) VALUES
('Calculus Homework Chapter 4', 'Mathematics', 'Assignment', DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), 'high', 'pending', 'Complete problem sets 4.1 to 4.5 on differential equations.'),
('Read Clean Code Chapters 1-3', 'Software Engineering', 'Book', DATE_ADD(CURRENT_DATE, INTERVAL 4 DAY), 'medium', 'pending', 'Read foundational principles of clean architecture and meaningful names.'),
('Physics Lab Report: Optics', 'Physics', 'Assignment', DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), 'high', 'pending', 'Submit lab observation report with refractive index calculations.'),
('Database Normalization Quiz Prep', 'Database Systems', 'Exam', DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY), 'medium', 'pending', 'Review 1NF, 2NF, 3NF and BCNF normalization rules and examples.'),
('Biology Research Proposal Draft', 'Biology', 'Project', DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), 'low', 'completed', 'Finalize proposal draft on cellular respiration mechanisms.'),
('Linear Algebra Matrix Quiz Review', 'Mathematics', 'Daily Task', DATE_SUB(CURRENT_DATE, INTERVAL 2 DAY), 'medium', 'completed', 'Reviewed eigenvalues, eigenvectors, and Gaussian elimination.');
