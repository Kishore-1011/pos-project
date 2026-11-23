/**
 * CSV Export Utility
 * Exports tabular data as a downloadable .csv file with Excel-compatible UTF-8 BOM.
 */

export function exportToCSV(filename, headers, rows) {
  if (!rows || rows.length === 0) {
    alert('No data available to export.');
    return;
  }

  // Format headers
  const headerKeys = headers.map(h => h.key);
  const headerLabels = headers.map(h => escapeCSVField(h.label));

  const csvRows = [headerLabels.join(',')];

  // Format row values
  for (const row of rows) {
    const values = headerKeys.map(key => {
      const val = row[key];
      if (val === null || val === undefined) return '""';
      return escapeCSVField(String(val));
    });
    csvRows.push(values.join(','));
  }

  const csvContent = '\uFEFF' + csvRows.join('\r\n'); // Add UTF-8 BOM
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${formatFileTimestamp()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSVField(field) {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

function formatFileTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
