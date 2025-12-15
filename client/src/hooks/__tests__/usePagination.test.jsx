import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePagination } from '../usePagination';

describe('usePagination Hook', () => {
    const sampleData = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

    it('should initialize with first page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        expect(result.current.currentPage).toBe(1);
        expect(result.current.totalPages).toBe(5);
        expect(result.current.paginatedData).toHaveLength(10);
        expect(result.current.paginatedData[0].id).toBe(1);
    });

    it('should paginate data correctly', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        expect(result.current.paginatedData[0].id).toBe(1);
        expect(result.current.paginatedData[9].id).toBe(10);
    });

    it('should navigate to next page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.nextPage();

        expect(result.current.currentPage).toBe(2);
        expect(result.current.paginatedData[0].id).toBe(11);
        expect(result.current.paginatedData[9].id).toBe(20);
    });

    it('should navigate to previous page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.nextPage();
        result.current.previousPage();

        expect(result.current.currentPage).toBe(1);
        expect(result.current.paginatedData[0].id).toBe(1);
    });

    it('should go to specific page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.goToPage(3);

        expect(result.current.currentPage).toBe(3);
        expect(result.current.paginatedData[0].id).toBe(21);
    });

    it('should go to first page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.goToPage(3);
        result.current.goToFirstPage();

        expect(result.current.currentPage).toBe(1);
    });

    it('should go to last page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.goToLastPage();

        expect(result.current.currentPage).toBe(5);
        expect(result.current.paginatedData).toHaveLength(10);
    });

    it('should not go beyond last page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.goToLastPage();
        result.current.nextPage();

        expect(result.current.currentPage).toBe(5);
    });

    it('should not go below first page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.previousPage();

        expect(result.current.currentPage).toBe(1);
    });

    it('should calculate hasNextPage correctly', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        expect(result.current.hasNextPage).toBe(true);

        result.current.goToLastPage();
        expect(result.current.hasNextPage).toBe(false);
    });

    it('should calculate hasPreviousPage correctly', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        expect(result.current.hasPreviousPage).toBe(false);

        result.current.nextPage();
        expect(result.current.hasPreviousPage).toBe(true);
    });

    it('should calculate start and end indices correctly', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        expect(result.current.startIndex).toBe(1);
        expect(result.current.endIndex).toBe(10);

        result.current.nextPage();
        expect(result.current.startIndex).toBe(11);
        expect(result.current.endIndex).toBe(20);
    });

    it('should handle last page with fewer items', () => {
        const { result } = renderHook(() => usePagination(sampleData, 10));

        result.current.goToLastPage();

        expect(result.current.paginatedData).toHaveLength(10);
        expect(result.current.endIndex).toBe(50);
    });

    it('should handle empty data', () => {
        const { result } = renderHook(() => usePagination([], 10));

        expect(result.current.currentPage).toBe(1);
        expect(result.current.totalPages).toBe(0);
        expect(result.current.paginatedData).toHaveLength(0);
    });

    it('should handle custom items per page', () => {
        const { result } = renderHook(() => usePagination(sampleData, 25));

        expect(result.current.totalPages).toBe(2);
        expect(result.current.paginatedData).toHaveLength(25);
    });
});
