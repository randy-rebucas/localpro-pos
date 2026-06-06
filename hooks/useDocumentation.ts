'use client';

import { useCallback, useEffect, useState } from 'react';

export type DocFolder = 'user-manual' | 'tenant-manual' | 'bir-documentation';

export interface DocIndex {
  files: string[];
  readme: string;
}

export type DocStatus = 'loading' | 'ready' | 'error';

export function useDocumentation(folder: DocFolder) {
  const [index, setIndex] = useState<DocIndex | null>(null);
  const [indexStatus, setIndexStatus] = useState<DocStatus>('loading');
  const [indexError, setIndexError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [contentStatus, setContentStatus] = useState<DocStatus>('loading');
  const [contentError, setContentError] = useState<string | null>(null);

  const refetchIndex = useCallback(async () => {
    setIndexStatus('loading');
    setIndexError(null);
    setContentStatus('loading');
    setContentError(null);
    setActiveFile(null);
    try {
      const res = await fetch(`/api/docs?folder=${folder}`);
      if (!res.ok) throw new Error('Failed to load docs');
      const data: DocIndex = await res.json();
      setIndex(data);
      setContent(data.readme);
      setContentStatus('ready');
      setIndexStatus('ready');
    } catch (err) {
      console.error('Failed to load documentation index:', err);
      setIndex(null);
      setContent('');
      setIndexError('Failed to load documentation');
      setIndexStatus('error');
      setContentStatus('error');
    }
  }, [folder]);

  const loadFile = useCallback(
    async (file: string) => {
      setContentStatus('loading');
      setContentError(null);
      try {
        const res = await fetch(`/api/docs?folder=${folder}&file=${encodeURIComponent(file)}`);
        if (!res.ok) throw new Error('Failed to load file');
        const data = await res.json();
        setContent(data.content);
        setActiveFile(file);
        setContentStatus('ready');
      } catch (err) {
        console.error('Failed to load documentation page:', err);
        setContentError('Failed to load this page');
        setContentStatus('error');
      }
    },
    [folder]
  );

  const showOverview = useCallback(() => {
    setActiveFile(null);
    setContentError(null);
    if (index) {
      setContent(index.readme);
      setContentStatus('ready');
    }
  }, [index]);

  useEffect(() => {
    refetchIndex();
  }, [refetchIndex]);

  return {
    index,
    indexStatus,
    indexError,
    refetchIndex,
    activeFile,
    content,
    contentStatus,
    contentError,
    loadFile,
    showOverview,
  };
}
