/**
 * Export utility functions for CSV/Excel/PDF export
 */
import { logger } from '@/lib/logger';

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV(data: any[], headers: string[]): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!data || data.length === 0) {
    return headers.join(',');
  }

  const rows = [headers.join(',')];

  for (const item of data) {
    const row = headers.map(header => {
      const value = getNestedValue(item, header);
      // Escape commas, quotes, and newlines in CSV
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) {
      return '';
    }
    value = value[key];
  }
  return value;
}

/**
 * Download CSV file
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Export data to Excel format (XLSX)
 * Uses exceljs (replaces vulnerable xlsx package)
 */
export async function downloadExcel(data: any[], headers: string[], filename: string): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    // Add header row
    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
    });

    // Add data rows
    for (const item of data) {
      const row = headers.map(header => {
        const value = getNestedValue(item, header);
        return value !== null && value !== undefined ? String(value) : '';
      });
      worksheet.addRow(row);
    }

    // Auto-fit column widths (approximate)
    worksheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLength) maxLength = Math.min(len, 40);
      });
      column.width = maxLength + 2;
    });

    // Generate buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    logger.error('Error exporting to Excel:', error);
    throw new Error('Excel export failed. Please ensure exceljs package is installed.');
  }
}

/**
 * Export data to PDF format
 * Requires: npm install jspdf
 */
export async function downloadPDF(
  data: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: string[],
  filename: string,
  title?: string
): Promise<void> {
  try {
    const jsPDF = (await import('jspdf')).default;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const startY = title ? 20 : margin;
    let y = startY;

    // Add title if provided
    if (title) {
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(title, margin, y);
      y += 10;
    }

    // Calculate column widths
    const colCount = headers.length;
    const colWidth = (pageWidth - 2 * margin) / colCount;

    // Header row
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    headers.forEach((header, index) => {
      const x = margin + index * colWidth;
      doc.text(header, x, y);
    });
    y += 7;

    // Draw header line
    doc.setLineWidth(0.5);
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
    y += 3;

    // Data rows
    doc.setFont(undefined, 'normal');
    data.forEach((row) => {
      // Check if we need a new page
      if (y > pageHeight - 20) {
        doc.addPage();
        y = margin;
      }

      headers.forEach((header, colIndex) => {
        const x = margin + colIndex * colWidth;
        const value = getNestedValue(row, header);
        const text = value !== null && value !== undefined ? String(value).substring(0, 20) : '';
        doc.text(text, x, y);
      });
      y += 6;
    });

    // Save PDF
    doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  } catch (error) {
    logger.error('Error exporting to PDF:', error);
    throw new Error('PDF export failed. Please ensure jspdf package is installed.');
  }
}
