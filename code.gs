/**
 * Google Apps Script Backend for Voting Pegawai
 * logic matches the frontend implementation in app.js
 */

const SPREADSHEET_ID = '1guLTYWRuK3H-skZAppA9D2GfRc6GRtsZ8EpJyDZf42c';
const SHEETS = {
  EMPLOYEES: 'Employees',
  REASONS: 'Reasons',
  VOTES: 'Votes',
  USERS: 'Users',
  CONFIG: 'Config'
};

/**
 * Handle GET requests (Data Retrieval)
 */
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'getAllData') {
      return jsonResponse({
        employees: getSheetData(SHEETS.EMPLOYEES),
        reasons: getSheetData(SHEETS.REASONS),
        votes: getSheetData(SHEETS.VOTES),
        users: getSheetData(SHEETS.USERS),
        config: getConfigData()
      });
    }
    
    return jsonResponse({ status: 'error', message: 'Invalid GET action' });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * Handle POST requests (Data Modification)
 */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ status: 'error', message: 'Invalid JSON body' });
  }
  
  const action = data.action;
  
  try {
    switch (action) {
      case 'saveVote':
        return saveVote(data);
      case 'publishResults':
        return setConfig('publication_status', data.status);
      case 'startNewSurvey':
        return setConfig('survey_period', data.survey_period);
      case 'updateEmployeeCategory':
        return updateEmployeeCategory(data);
      case 'addReason':
        return addReason(data);
      case 'deleteReason':
        return deleteReason(data);
      case 'addUser':
        return addUser(data);
      case 'deleteUser':
        return deleteUser(data);
      case 'updateEmployeePhoto':
        return updateEmployeePhoto(data);
      case 'savePhoto':
        return updateEmployeePhoto(data); // Reuse same logic for photo URL
      default:
        return jsonResponse({ status: 'error', message: 'Invalid POST action: ' + action });
    }
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * --- DATABASE FUNCTIONS ---
 */

function getSheetData(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const range = sheet.getDataRange();
  const values = range.getValues();
  const formulas = range.getFormulas();
  
  if (values.length <= 1) return [];
  
  const headers = values[0];
  return values.slice(1).map((row, rowIndex) => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      const formula = formulas[rowIndex + 1] ? formulas[rowIndex + 1][i] : '';
      
      // If it's an =IMAGE formula, extract the URL for the frontend
      if (formula && formula.toUpperCase().indexOf('=IMAGE') !== -1) {
        const match = formula.match(/"([^"]+)"/);
        if (match) val = match[1];
      }
      
      // Force large IDs / NIP to be strings to prevent precision loss in browser
      if (h.toLowerCase().indexOf('id') !== -1 || h.toLowerCase().indexOf('nip') !== -1) {
        val = String(val);
      }
      
      obj[h] = val;
    });
    return obj;
  });
}

function getConfigData() {
  const data = getSheetData(SHEETS.CONFIG);
  const config = {};
  data.forEach(row => {
    config[row.key] = row.value;
  });
  return config;
}

function setConfig(key, value) {
  const sheet = getOrCreateSheet(SHEETS.CONFIG);
  const data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      found = true;
      break;
    }
  }
  
  if (!found) {
    sheet.appendRow([key, value]);
  }
  
  return jsonResponse({ status: 'success' });
}

function saveVote(data) {
  const sheet = getOrCreateSheet(SHEETS.VOTES);
  sheet.appendRow([
    data.voter_id,
    data.voter_name,
    data.employee_id,
    data.employee_name,
    data.category,
    data.reason,
    data.timestamp || new Date().toISOString(),
    data.survey_period
  ]);
  return jsonResponse({ status: 'success' });
}

function updateEmployeeCategory(data) {
  const sheet = getOrCreateSheet(SHEETS.EMPLOYEES);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const colIndex = headers.indexOf(data.category); // 'terbaik' or 'indisipliner'
  
  if (colIndex === -1) return jsonResponse({ status: 'error', message: 'Category column not found' });
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.employee_id)) {
      sheet.getRange(i + 1, colIndex + 1).setValue(data.mode === 'add' ? 'YA' : 'TIDAK');
      return jsonResponse({ status: 'success' });
    }
  }
  
  return jsonResponse({ status: 'error', message: 'Employee not found' });
}

function updateEmployeePhoto(data) {
  const sheet = getOrCreateSheet(SHEETS.EMPLOYEES);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const colIndex = headers.indexOf('photo_url');
  
  if (colIndex === -1) return jsonResponse({ status: 'error', message: 'photo_url column not found' });
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.employee_id)) {
      // Set as internal IMAGE formula for visual display in Sheet
      const formula = '=IMAGE("' + data.photo_url + '")';
      sheet.getRange(i + 1, colIndex + 1).setFormula(formula);
      return jsonResponse({ status: 'success' });
    }
  }
  
  return jsonResponse({ status: 'error', message: 'Employee not found' });
}

function addReason(data) {
  const sheet = getOrCreateSheet(SHEETS.REASONS);
  sheet.appendRow([data.category, data.alasan]);
  return jsonResponse({ status: 'success' });
}

function deleteReason(data) {
  const sheet = getOrCreateSheet(SHEETS.REASONS);
  const values = sheet.getDataRange().getValues();
  
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === data.category && values[i][1] === data.alasan) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ status: 'success' });
    }
  }
  return jsonResponse({ status: 'error', message: 'Reason not found' });
}

function addUser(data) {
  const sheet = getOrCreateSheet(SHEETS.USERS);
  const id = 'U' + Utils.generateId();
  sheet.appendRow([id, data.name, data.username, data.password]);
  return jsonResponse({ status: 'success' });
}

function deleteUser(data) {
  const sheet = getOrCreateSheet(SHEETS.USERS);
  const values = sheet.getDataRange().getValues();
  
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ status: 'success' });
    }
  }
  return jsonResponse({ status: 'error', message: 'User not found' });
}

/**
 * --- UTILITIES ---
 */

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Add default headers
    const headers = {
      [SHEETS.EMPLOYEES]: ['id', 'name', 'position', 'photo_url', 'terbaik', 'indisipliner'],
      [SHEETS.REASONS]: ['category', 'alasan'],
      [SHEETS.VOTES]: ['voter_id', 'voter_name', 'employee_id', 'employee_name', 'category', 'reason', 'timestamp', 'survey_period'],
      [SHEETS.USERS]: ['id', 'name', 'username', 'password'],
      [SHEETS.CONFIG]: ['key', 'value']
    };
    if (headers[name]) {
      sheet.appendRow(headers[name]);
      if (name === SHEETS.CONFIG) {
        sheet.appendRow(['survey_period', 'Triwulan I 2026']);
        sheet.appendRow(['publication_status', 'Draft']);
      }
    }
  }
  return sheet;
}

const Utils = {
  generateId: function() {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
  }
};

/**
 * MANUAL RUN: Initialize the database with some demo data
 */
function initDemoData() {
  getOrCreateSheet(SHEETS.EMPLOYEES);
  getOrCreateSheet(SHEETS.REASONS);
  getOrCreateSheet(SHEETS.VOTES);
  getOrCreateSheet(SHEETS.USERS);
  getOrCreateSheet(SHEETS.CONFIG);
  
  const empSheet = getOrCreateSheet(SHEETS.EMPLOYEES);
  if (empSheet.getLastRow() === 1) {
    empSheet.appendRow(['1', 'Budi Santoso', 'Staf KPLP', '', 'YA', 'TIDAK']);
    empSheet.appendRow(['2', 'Siti Aminah', 'Staf Kamtib', '', 'TIDAK', 'YA']);
    empSheet.appendRow(['3', 'Agus Prayitno', 'Staf Giatja', '', 'YA', 'YA']);
  }
  
  const userSheet = getOrCreateSheet(SHEETS.USERS);
  if (userSheet.getLastRow() === 1) {
    userSheet.appendRow(['U001', 'Pegawai Demo', 'user', '123']);
  }
}
