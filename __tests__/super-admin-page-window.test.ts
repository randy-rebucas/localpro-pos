import { describe, it, expect } from 'vitest';
import { pageWindow } from '@/components/super-admin/ui';

describe('pageWindow', () => {
  it('prints every page when there are few', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('keeps first, last and neighbours with gaps between', () => {
    expect(pageWindow(1, 13)).toEqual([1, 2, null, 13]);
    expect(pageWindow(7, 13)).toEqual([1, null, 6, 7, 8, null, 13]);
    expect(pageWindow(13, 13)).toEqual([1, null, 12, 13]);
  });

  it('prints a single hidden page instead of a gap', () => {
    expect(pageWindow(4, 13)).toEqual([1, 2, 3, 4, 5, null, 13]);
    expect(pageWindow(10, 13)).toEqual([1, null, 9, 10, 11, 12, 13]);
  });
});
