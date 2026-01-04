/**
 * Export utility functions for CSV/Excel/PDF export
 */

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV(data: Record<string, unknown>[], headers: string[]): string {
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
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
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
 * Requires: npm install xlsx
 */
export async function downloadExcel(data: Record<string, unknown>[], headers: string[], filename: string): Promise<void> {
  try {
    const XLSX = await import('xlsx');
    
    // Prepare worksheet data
    const worksheetData = [
      headers, // Header row
      ...data.map(row => headers.map(header => {
        const value = getNestedValue(row, header);
        return value !== null && value !== undefined ? String(value) : '';
      })),
    ];
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths (auto-width approximation)
    const colWidths = headers.map(() => ({ wch: 15 }));
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    // Generate file and download
    XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw new Error('Excel export failed. Please ensure xlsx package is installed.');
  }
}

/**
 * Export data to PDF format
 * Requires: npm install jspdf
 */
export async function downloadPDF(
  data: Record<string, unknown>[], 
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
    console.error('Error exporting to PDF:', error);
    throw new Error('PDF export failed. Please ensure jspdf package is installed.');
  }
}

