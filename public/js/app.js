/**
 * StudyTrack Pro - Frontend Application Logic
 * Modern Vanilla JavaScript for Student Task & Assignment Management
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    tasks: [],
    filterStatus: 'all',     // 'all' | 'pending' | 'completed' | 'high' | 'today'
    filterSubject: 'all',
    filterPriority: 'all',
    filterCategory: 'all',
    sortBy: 'due_asc',
    searchQuery: '',
    dbEngine: 'unknown'
  };

  // DOM Elements
  const taskListContainer = document.getElementById('taskListContainer');
  const taskForm = document.getElementById('taskForm');
  const globalSearchInput = document.getElementById('globalSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const dbStatusPill = document.getElementById('dbStatusPill');
  const dbStatusLabel = document.getElementById('dbStatusLabel');
  const resetDemoBtn = document.getElementById('resetDemoBtn');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const appSidebar = document.getElementById('appSidebar');

  // Stats DOM
  const statTotalVal = document.getElementById('statTotalVal');
  const statPendingVal = document.getElementById('statPendingVal');
  const statCompletedVal = document.getElementById('statCompletedVal');
  const statRateVal = document.getElementById('statRateVal');
  const statProgressBar = document.getElementById('statProgressBar');

  // Badges DOM
  const segBadgeAll = document.getElementById('segBadgeAll');
  const segBadgePending = document.getElementById('segBadgePending');
  const segBadgeCompleted = document.getElementById('segBadgeCompleted');
  const countAllBadge = document.getElementById('countAllBadge');
  const countPendingBadge = document.getElementById('countPendingBadge');
  const countCompletedBadge = document.getElementById('countCompletedBadge');
  const countHighBadge = document.getElementById('countHighBadge');
  const countTodayBadge = document.getElementById('countTodayBadge');

  // Filter Selects
  const filterSubjectSelect = document.getElementById('filterSubjectSelect');
  const filterPrioritySelect = document.getElementById('filterPrioritySelect');
  const sortBySelect = document.getElementById('sortBySelect');

  // Subtabs
  const tabAddAssignment = document.getElementById('tabAddAssignment');
  const tabAddBook = document.getElementById('tabAddBook');
  const taskTitleInput = document.getElementById('taskTitle');
  const taskCategorySelect = document.getElementById('taskCategory');

  // Modal Elements
  const editModal = document.getElementById('editModal');
  const editTaskForm = document.getElementById('editTaskForm');
  const closeEditModalBtn = document.getElementById('closeEditModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  // Set default due date in form to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDateStr = tomorrow.toISOString().split('T')[0];
  document.getElementById('taskDueDate').value = defaultDateStr;

  // Initialize
  initApp();

  async function initApp() {
    setupEventListeners();
    await checkHealth();
    await loadTasks();
    await updateStats();
  }

  // ==========================================
  // EVENT LISTENERS SETUP
  // ==========================================
  function setupEventListeners() {
    // Mobile Sidebar Toggle
    if (mobileMenuToggle && appSidebar) {
      mobileMenuToggle.addEventListener('click', () => {
        appSidebar.classList.toggle('mobile-open');
      });
    }

    // Subtab switching (Add Assignment vs Add Book)
    tabAddAssignment.addEventListener('click', () => {
      tabAddAssignment.classList.add('active');
      tabAddBook.classList.remove('active');
      taskCategorySelect.value = 'Assignment';
      taskTitleInput.placeholder = 'e.g. Calculus Homework';
      taskTitleInput.focus();
    });

    tabAddBook.addEventListener('click', () => {
      tabAddBook.classList.add('active');
      tabAddAssignment.classList.remove('active');
      taskCategorySelect.value = 'Book';
      taskTitleInput.placeholder = 'e.g. Read Chapters 1-3 of Clean Code';
      taskTitleInput.focus();
    });

    // Form submission
    taskForm.addEventListener('submit', handleCreateTask);

    // Form clear button
    document.getElementById('clearFormBtn').addEventListener('click', () => {
      taskForm.reset();
      document.getElementById('taskDueDate').value = defaultDateStr;
      clearFormErrors();
    });

    // Segmented Status Tabs
    document.querySelectorAll('.seg-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filterStatus = btn.dataset.tab;
        syncSidebarFilterHighlight();
        renderTasks();
      });
    });

    // Sidebar Filters
    document.querySelectorAll('.filter-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const filterKey = item.dataset.filter;
        state.filterStatus = filterKey;

        // Sync segmented tab if it matches
        document.querySelectorAll('.seg-tab').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === filterKey);
        });

        renderTasks();
      });
    });

    // Dropdown Filters
    filterSubjectSelect.addEventListener('change', (e) => {
      state.filterSubject = e.target.value;
      renderTasks();
    });

    filterPrioritySelect.addEventListener('change', (e) => {
      state.filterPriority = e.target.value;
      renderTasks();
    });

    sortBySelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderTasks();
    });

    // Global Search with debounce
    let searchTimeout;
    globalSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearSearchBtn.style.display = val ? 'block' : 'none';
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.searchQuery = val.toLowerCase();
        renderTasks();
      }, 200);
    });

    clearSearchBtn.addEventListener('click', () => {
      globalSearchInput.value = '';
      state.searchQuery = '';
      clearSearchBtn.style.display = 'none';
      renderTasks();
      globalSearchInput.focus();
    });

    // Demo Data Reset Button
    resetDemoBtn.addEventListener('click', handleResetDemo);

    // Modal Events
    closeEditModalBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditModal();
    });
    editTaskForm.addEventListener('submit', handleSaveEditTask);
  }

  // ==========================================
  // API CALLS
  // ==========================================

  // Check Backend Health & Active Engine
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        state.dbEngine = data.engine;
        if (data.engine === 'mysql') {
          dbStatusLabel.textContent = 'MySQL Database';
          dbStatusPill.title = 'Connected to MySQL relational engine';
        } else {
          dbStatusLabel.textContent = 'Resilient Store (Active)';
          dbStatusPill.title = 'Running on high-performance resilient storage';
        }
      }
    } catch (err) {
      dbStatusLabel.textContent = 'Offline Mode';
      console.warn('Backend status check failed:', err);
    }
  }

  // Fetch all tasks from backend
  async function loadTasks() {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to load tasks');
      const data = await res.json();
      state.tasks = data;
      populateSubjectDropdown(data);
      renderTasks();
    } catch (err) {
      console.error('Error loading tasks:', err);
      taskListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h4 class="empty-title">Could not load tasks</h4>
          <p class="empty-text">Please check that the server is running and refresh.</p>
        </div>
      `;
    }
  }

  // Fetch Summary Stats
  async function updateStats() {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const stats = await res.json();
        statTotalVal.textContent = stats.total;
        statPendingVal.textContent = stats.pending;
        statCompletedVal.textContent = stats.completed;
        statRateVal.textContent = `${stats.completionRate}%`;
        statProgressBar.style.width = `${stats.completionRate}%`;

        // Update Tab Badges
        segBadgeAll.textContent = stats.total;
        segBadgePending.textContent = stats.pending;
        segBadgeCompleted.textContent = stats.completed;
        countAllBadge.textContent = stats.total;
        countPendingBadge.textContent = stats.pending;
        countCompletedBadge.textContent = stats.completed;
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }

    // Calculate High & Today Counts from current loaded tasks
    const todayStr = new Date().toISOString().split('T')[0];
    const highCount = state.tasks.filter(t => t.status === 'pending' && t.priority === 'high').length;
    const todayCount = state.tasks.filter(t => t.due_date === todayStr).length;
    countHighBadge.textContent = highCount;
    countTodayBadge.textContent = todayCount;
  }

  // Handle New Task Creation
  async function handleCreateTask(e) {
    e.preventDefault();
    clearFormErrors();

    const title = taskTitleInput.value.trim();
    const subject = document.getElementById('taskSubject').value.trim();
    const dueDate = document.getElementById('taskDueDate').value;
    const category = taskCategorySelect.value;
    const description = document.getElementById('taskDesc').value.trim();

    const priorityInput = document.querySelector('input[name="priorityRadio"]:checked');
    const priority = priorityInput ? priorityInput.value : 'medium';

    // Validation
    let hasError = false;
    if (!title) {
      document.getElementById('titleError').textContent = 'Please enter an assignment or task title';
      hasError = true;
    }
    if (!subject) {
      document.getElementById('subjectError').textContent = 'Please enter a course or subject';
      hasError = true;
    }
    if (!dueDate) {
      document.getElementById('dueDateError').textContent = 'Please choose a due date';
      hasError = true;
    }

    if (hasError) return;

    const saveBtn = document.getElementById('saveTaskBtn');
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span>Saving...</span>`;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          subject,
          category,
          due_date: dueDate,
          priority,
          description
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create task');
      }

      const result = await res.json();
      showToast(`Task "${title}" created successfully! ✨`, 'success');

      // Reset form
      taskTitleInput.value = '';
      document.getElementById('taskDesc').value = '';
      document.getElementById('taskDueDate').value = defaultDateStr;

      // Reload tasks & stats
      await loadTasks();
      await updateStats();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalBtnText;
    }
  }

  // Toggle Task Completion Status
  async function handleToggleTask(id, currentStatus) {
    try {
      // Optimistic update
      const target = state.tasks.find(t => t.id === id);
      if (target) {
        target.status = target.status === 'completed' ? 'pending' : 'completed';
        renderTasks();
      }

      const res = await fetch(`/api/tasks/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error('Status update failed');
      const result = await res.json();

      const isCompleted = result.task.status === 'completed';
      showToast(
        isCompleted ? 'Task marked as completed! 🎉' : 'Task restored to pending',
        'info'
      );

      await updateStats();
    } catch (err) {
      showToast('Error updating status: ' + err.message, 'error');
      await loadTasks(); // Revert on failure
    }
  }

  // Delete Task
  async function handleDeleteTask(id, title) {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete task');

      showToast(`Task deleted successfully`, 'info');
      state.tasks = state.tasks.filter(t => t.id !== id);
      renderTasks();
      await updateStats();
    } catch (err) {
      showToast('Error deleting task: ' + err.message, 'error');
    }
  }

  // Open Edit Modal
  function openEditModal(task) {
    document.getElementById('editTaskId').value = task.id;
    document.getElementById('editTaskTitle').value = task.title;
    document.getElementById('editTaskSubject').value = task.subject;
    document.getElementById('editTaskCategory').value = task.category || 'Assignment';
    document.getElementById('editTaskDueDate').value = task.due_date;
    document.getElementById('editTaskPriority').value = task.priority;
    document.getElementById('editTaskStatus').value = task.status;
    document.getElementById('editTaskDesc').value = task.description || '';
    editModal.style.display = 'flex';
  }

  function closeEditModal() {
    editModal.style.display = 'none';
  }

  // Save Task Changes from Edit Modal
  async function handleSaveEditTask(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('editTaskId').value, 10);
    const title = document.getElementById('editTaskTitle').value.trim();
    const subject = document.getElementById('editTaskSubject').value.trim();
    const category = document.getElementById('editTaskCategory').value;
    const dueDate = document.getElementById('editTaskDueDate').value;
    const priority = document.getElementById('editTaskPriority').value;
    const status = document.getElementById('editTaskStatus').value;
    const description = document.getElementById('editTaskDesc').value.trim();

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          subject,
          category,
          due_date: dueDate,
          priority,
          status,
          description
        })
      });

      if (!res.ok) throw new Error('Update failed');

      closeEditModal();
      showToast('Task details updated! ✅', 'success');
      await loadTasks();
      await updateStats();
    } catch (err) {
      showToast('Error saving changes: ' + err.message, 'error');
    }
  }

  // Reset Demo Tasks
  async function handleResetDemo() {
    if (!confirm('Reload default demo tasks? This will reset student sample assignments.')) {
      return;
    }

    try {
      const res = await fetch('/api/tasks/seed', { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      showToast('Demo tasks refreshed successfully! 🎓', 'success');
      await loadTasks();
      await updateStats();
    } catch (err) {
      showToast('Could not reset demo tasks: ' + err.message, 'error');
    }
  }

  // ==========================================
  // RENDERING & UI HELPERS
  // ==========================================

  function renderTasks() {
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter Tasks
    let filtered = state.tasks.filter(task => {
      // Status Filter
      if (state.filterStatus === 'pending' && task.status !== 'pending') return false;
      if (state.filterStatus === 'completed' && task.status !== 'completed') return false;
      if (state.filterStatus === 'high' && !(task.status === 'pending' && task.priority === 'high')) return false;
      if (state.filterStatus === 'today' && task.due_date !== todayStr) return false;

      // Subject Filter
      if (state.filterSubject !== 'all' && task.subject.toLowerCase() !== state.filterSubject.toLowerCase()) {
        return false;
      }

      // Priority Filter
      if (state.filterPriority !== 'all' && task.priority !== state.filterPriority) {
        return false;
      }

      // Search Query
      if (state.searchQuery) {
        const q = state.searchQuery;
        const matchesTitle = task.title && task.title.toLowerCase().includes(q);
        const matchesSubject = task.subject && task.subject.toLowerCase().includes(q);
        const matchesDesc = task.description && task.description.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubject && !matchesDesc) return false;
      }

      return true;
    });

    // Sort Tasks
    filtered.sort((a, b) => {
      if (state.sortBy === 'due_asc') return new Date(a.due_date) - new Date(b.due_date);
      if (state.sortBy === 'due_desc') return new Date(b.due_date) - new Date(a.due_date);
      if (state.sortBy === 'priority_desc') {
        const pOrder = { high: 3, medium: 2, low: 1 };
        return (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0);
      }
      if (state.sortBy === 'id_desc') return b.id - a.id;
      return 0;
    });

    // Render HTML
    if (filtered.length === 0) {
      taskListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h4 class="empty-title">No tasks found</h4>
          <p class="empty-text">No assignments match your current filters or search query. Try switching filters or add a new task above!</p>
        </div>
      `;
      return;
    }

    taskListContainer.innerHTML = filtered.map(task => renderTaskItem(task, todayStr)).join('');

    // Attach row events
    filtered.forEach(task => {
      // Toggle button
      const chkBtn = document.getElementById(`chkBtn-${task.id}`);
      if (chkBtn) {
        chkBtn.addEventListener('click', () => handleToggleTask(task.id, task.status));
      }

      // Edit button
      const editBtn = document.getElementById(`editBtn-${task.id}`);
      if (editBtn) {
        editBtn.addEventListener('click', () => openEditModal(task));
      }

      // Delete button
      const delBtn = document.getElementById(`delBtn-${task.id}`);
      if (delBtn) {
        delBtn.addEventListener('click', () => handleDeleteTask(task.id, task.title));
      }
    });
  }

  function renderTaskItem(task, todayStr) {
    const isCompleted = task.status === 'completed';
    const prioClass = `badge-prio-${task.priority || 'medium'}`;
    const prioLabel = (task.priority || 'Medium').toUpperCase();

    // Category mapping
    const cat = task.category || 'Assignment';
    let catClass = 'badge-cat-assignment';
    if (cat.toLowerCase().includes('book')) catClass = 'badge-cat-book';
    else if (cat.toLowerCase().includes('exam')) catClass = 'badge-cat-exam';
    else if (cat.toLowerCase().includes('project')) catClass = 'badge-cat-project';
    else if (cat.toLowerCase().includes('daily')) catClass = 'badge-cat-daily';

    // Due Date relative calculation
    const dueTime = new Date(task.due_date).setHours(0, 0, 0, 0);
    const todayTime = new Date(todayStr).setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    let deadlineBadge = '';
    if (isCompleted) {
      deadlineBadge = `<span class="deadline-pill deadline-future">Completed</span>`;
    } else if (diffDays < 0) {
      deadlineBadge = `<span class="deadline-pill deadline-overdue">⚠️ Overdue by ${Math.abs(diffDays)}d</span>`;
    } else if (diffDays === 0) {
      deadlineBadge = `<span class="deadline-pill deadline-today">⚡ Due Today</span>`;
    } else if (diffDays === 1) {
      deadlineBadge = `<span class="deadline-pill deadline-today">⏳ Due Tomorrow</span>`;
    } else {
      deadlineBadge = `<span class="deadline-pill deadline-future">📅 Due in ${diffDays} days</span>`;
    }

    return `
      <div class="task-item ${isCompleted ? 'completed' : ''}" id="taskRow-${task.id}">
        <!-- Completion Checkbox Toggle -->
        <button class="task-checkbox-btn" id="chkBtn-${task.id}" title="${isCompleted ? 'Mark as pending' : 'Mark as completed'}">
          <div class="checkbox-custom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </button>

        <!-- Task Body -->
        <div class="task-info">
          <div class="task-top-row">
            <span class="badge ${catClass}">${escapeHtml(cat)}</span>
            <span class="badge badge-subject">${escapeHtml(task.subject)}</span>
            <span class="badge ${prioClass}">${prioLabel}</span>
          </div>

          <div class="task-title">${escapeHtml(task.title)}</div>

          ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}

          <div class="task-bottom-meta">
            <div class="meta-item">
              ${deadlineBadge}
            </div>
            <div class="meta-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Target: ${formatDate(task.due_date)}</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="task-actions">
          <button class="btn-icon" id="editBtn-${task.id}" title="Edit task details">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon btn-icon-delete" id="delBtn-${task.id}" title="Delete task">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  }

  // Populate dynamic subjects into dropdown
  function populateSubjectDropdown(tasks) {
    const subjects = Array.from(new Set(tasks.map(t => t.subject).filter(Boolean))).sort();
    const currentVal = filterSubjectSelect.value;
    filterSubjectSelect.innerHTML = `<option value="all">All Subjects</option>`;
    subjects.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      if (sub === currentVal) opt.selected = true;
      filterSubjectSelect.appendChild(opt);
    });
  }

  function syncSidebarFilterHighlight() {
    document.querySelectorAll('.filter-item').forEach(i => {
      i.classList.toggle('active', i.dataset.filter === state.filterStatus);
    });
  }

  function clearFormErrors() {
    document.getElementById('titleError').textContent = '';
    document.getElementById('subjectError').textContent = '';
    document.getElementById('dueDateError').textContent = '';
  }

  function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
