'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { logger } from '@/lib/logger';
import toast from 'react-hot-toast';

interface UploadedFile {
  id?: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
}

export default function FileUploadPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [viewingFile, setViewingFile] = useState<UploadedFile | null>(null);
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#3b82f6';

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      setLoading(false);
    });
  }, [lang]);

  useEffect(() => {
    fetchUploadedFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  // Fetch uploaded files from database
  const fetchUploadedFiles = async () => {
    try {
      const res = await fetch(`/api/upload?tenant=${tenant}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setUploadedFiles(
            data.data.map((file: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
              name: file.name,
              size: file.size,
              type: file.type,
              url: file.url,
              uploadedAt: file.uploadedAt,
            }))
          );
        }
      }
    } catch (error) {
      logger.error('Error fetching files:', error);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error('File type not allowed. Please upload an image, PDF, or spreadsheet.');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size exceeds 10MB limit.');
      return;
    }

    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/upload?tenant=${tenant}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to upload file');
      }

      const data = await res.json();
      const newFile: UploadedFile = {
        id: data.data.id,
        name: file.name,
        size: file.size,
        type: file.type,
        url: data.data.url || `/uploads/${tenant}/${file.name}`,
        uploadedAt: data.data.uploadedAt || new Date().toISOString(),
      };

      setUploadedFiles([newFile, ...uploadedFiles]);
      toast.success(`${file.name} uploaded successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      toast.error(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const s = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + s[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US') + ' ' + date.toLocaleTimeString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('URL copied to clipboard');
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div
            className="inline-block animate-spin h-8 w-8 border-b-2"
            style={{ borderColor: primaryColor, borderBottomColor: 'transparent' }}
          ></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            File Upload
          </h1>
          <p className="text-gray-600">
            Upload images, documents, and media files to your account. Max file size: 10MB.
          </p>
        </div>

        <div className="space-y-8">
          {/* Upload Section */}
          <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Upload File</h2>
            
            {/* Drag & Drop Area */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`w-full border-2 border-dashed rounded p-8 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-gray-50 hover:border-gray-400'
              }`}
            >
              <input
                type="file"
                id="file-upload"
                onChange={handleChange}
                disabled={uploading}
                className="hidden"
                accept="image/*,.pdf,.csv,.xls,.xlsx"
              />
              <label
                htmlFor="file-upload"
                className="block cursor-pointer"
              >
                <svg
                  className="mx-auto h-12 w-12 text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-lg font-semibold text-gray-900 mb-1">
                  Drag and drop your file here
                </p>
                <p className="text-gray-600 text-sm">
                  or click to select from your computer
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Supported: Images (PNG, JPG, GIF, WebP), PDF, CSV, Excel
                </p>
              </label>
            </div>

            {/* File Input */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Or select a file
              </label>
              <input
                type="file"
                onChange={handleChange}
                disabled={uploading}
                className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                accept="image/*,.pdf,.csv,.xls,.xlsx"
              />
            </div>

            {/* Upload Status */}
            {uploading && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-300">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-b-2 border-blue-600"></div>
                  <p className="text-blue-900">Uploading file...</p>
                </div>
              </div>
            )}
          </div>

          {/* File Type Info */}
          <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Allowed File Types</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 border border-gray-300">
                <h3 className="font-semibold text-gray-900 mb-2">Images</h3>
                <p className="text-sm text-gray-600">
                  PNG, JPG, GIF, WebP - Perfect for logos, product photos, and branding
                </p>
              </div>
              <div className="p-4 border border-gray-300">
                <h3 className="font-semibold text-gray-900 mb-2">Documents</h3>
                <p className="text-sm text-gray-600">
                  PDF - For invoices, receipts, and reports
                </p>
              </div>
              <div className="p-4 border border-gray-300">
                <h3 className="font-semibold text-gray-900 mb-2">Spreadsheets</h3>
                <p className="text-sm text-gray-600">
                  CSV, XLS, XLSX - For data imports and exports
                </p>
              </div>
              <div className="p-4 border border-gray-300">
                <h3 className="font-semibold text-gray-900 mb-2">Size Limit</h3>
                <p className="text-sm text-gray-600">
                  Maximum 10MB per file
                </p>
              </div>
            </div>
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Uploads</h2>
              <div className="space-y-3">
                {uploadedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="border border-gray-300 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-gray-100 flex items-center justify-center">
                          {file.type.startsWith('image/') ? (
                            <svg
                              className="w-6 h-6 text-gray-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-6 h-6 text-gray-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 break-all">{file.name}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-1">
                          <span>{formatFileSize(file.size)}</span>
                          <span>{formatDate(file.uploadedAt)}</span>
                        </div>
                        <div className="mt-3 p-3 bg-gray-50 border border-gray-200">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Public URL:</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="flex-1 text-xs bg-white px-2 py-1 border border-gray-300 text-gray-700 break-all">
                              {file.url}
                            </code>
                            <button
                              onClick={() => copyToClipboard(file.url)}
                              className="px-2 py-1 bg-gray-200 text-gray-700 hover:bg-gray-300 text-xs font-medium transition-colors whitespace-nowrap"
                              title="Copy URL"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <button
                          onClick={() => {
                            setViewingFile(file);
                            setShowModal(true);
                          }}
                          className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm font-medium transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {uploadedFiles.length === 0 && !uploading && (
            <div className="bg-white border border-gray-300 p-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-gray-500">No files uploaded yet</p>
              <p className="text-gray-400 text-sm mt-1">Upload your first file to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* File View Modal */}
      {showModal && viewingFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-4xl w-full max-h-[90vh] overflow-auto">
            {/* Modal Header */}
            <div className="border-b border-gray-300 p-6 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 break-all">{viewingFile.name}</h2>
                <p className="text-sm text-gray-600 mt-1">{formatFileSize(viewingFile.size)}</p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setViewingFile(null);
                }}
                className="ml-4 flex-shrink-0 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* URL Section */}
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200">
                <p className="text-xs font-semibold text-gray-700 mb-2">Public URL:</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="flex-1 text-xs bg-white px-3 py-2 border border-gray-300 text-gray-700 break-all">
                    {viewingFile.url}
                  </code>
                  <button
                    onClick={() => copyToClipboard(viewingFile.url)}
                    className="px-3 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm font-medium transition-colors whitespace-nowrap"
                    title="Copy URL"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {viewingFile.type.startsWith('image/') ? (
                // Image Preview
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewingFile.url}
                    alt={viewingFile.name}
                    className="max-w-full max-h-[calc(90vh-200px)] object-contain"
                  />
                </div>
              ) : viewingFile.type === 'application/pdf' ? (
                // PDF Embed
                <div className="space-y-4">
                  <iframe
                    src={viewingFile.url}
                    className="w-full h-[500px] border border-gray-300"
                    title={viewingFile.name}
                  />
                  <a
                    href={viewingFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download PDF
                  </a>
                </div>
              ) : (
                // Other file types (CSV, Excel, etc.)
                <div className="space-y-4 text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-gray-900 mb-2">{viewingFile.name}</p>
                    <p className="text-gray-600 text-sm mb-4">Preview not available for this file type</p>
                  </div>
                  <a
                    href={viewingFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
