import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DOCS_BASE = path.join(process.cwd(), 'docs');

// Allowed doc folders
const ALLOWED_FOLDERS = ['user-manual', 'tenant-manual'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get('folder') || 'user-manual';
  const file = searchParams.get('file');

  // Validate folder
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
  }

  const folderPath = path.join(DOCS_BASE, folder);

  // If no file specified, return the index (list of files)
  if (!file) {
    try {
      const files = fs.readdirSync(folderPath)
        .filter((f: string) => f.endsWith('.md'))
        .sort();

      // Read README.md for the index content
      const readmePath = path.join(folderPath, 'README.md');
      let readme = '';
      if (fs.existsSync(readmePath)) {
        readme = fs.readFileSync(readmePath, 'utf-8');
      }

      return NextResponse.json({ files, readme });
    } catch {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }
  }

  // Validate file name (prevent path traversal)
  if (!/^[a-zA-Z0-9_-]+\.md$/.test(file)) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }

  const filePath = path.join(folderPath, file);

  // Verify the resolved path is within the docs folder
  if (!filePath.startsWith(DOCS_BASE)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return NextResponse.json({ content, file });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
