import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import POS from '../pages/POS';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'react-hot-toast';

// Mock API module instead of axios
vi.mock('../utils/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
    }
}));

vi.mock('react-hot-toast', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    }
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Import api after mocking
import api from '../utils/api';

// Mock Data
const mockMenu = [
    { id: 1, name: 'Chicken Biryani', price: 150, category: 'Main Course' },
    { id: 2, name: 'Coke', price: 40, category: 'Beverages' },
    { id: 3, name: 'Paneer Tikka', price: 180, category: 'Starters' }
];

describe('POS Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup LocalStorage mock
        vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('mock-token');

        // Setup API mock
        api.get.mockResolvedValue({ data: mockMenu });
    });

    const renderPOS = () => {
        return render(
            <BrowserRouter>
                <POS />
            </BrowserRouter>
        );
    };

    it('loads and displays menu items', async () => {
        renderPOS();

        await waitFor(() => {
            expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
            expect(screen.getByText('Coke')).toBeInTheDocument();
        });

        expect(screen.getByText('Categories')).toBeInTheDocument();
        // Check categories are derived correctly
        expect(screen.getByText('All')).toBeInTheDocument();
        expect(screen.getByText('Main Course')).toBeInTheDocument();
    });

    it('redirects if no token', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
        renderPOS();

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Please login to access POS');
            expect(mockNavigate).toHaveBeenCalledWith('/login');
        });
    });

    it('adds items to cart', async () => {
        renderPOS();
        await waitFor(() => screen.getByText('Chicken Biryani'));

        const itemButton = screen.getByText('Chicken Biryani').closest('button');
        fireEvent.click(itemButton);

        // Check cart updates
        expect(screen.getByText('Chicken Biryani', { selector: '.font-medium' })).toBeInTheDocument();
        expect(screen.getByText('150')).toBeInTheDocument(); // Price in cart
    });

    it('calculates total correctly', async () => {
        renderPOS();
        await waitFor(() => screen.getByText('Chicken Biryani'));

        // Find buttons first
        const biryaniBtn = screen.getByText('Chicken Biryani').closest('button');
        // For Coke, there might be multiple if already in cart, so get the menu item specifically
        // Menu items are in the center grid. 
        // We can use getAllByText and pick the one that is a Button and contains price '40' in a child span?
        // Or simply capture it before adding to cart.
        const cokeText = screen.getByText('Coke');
        const cokeBtn = cokeText.closest('button');

        fireEvent.click(biryaniBtn);
        fireEvent.click(cokeBtn);

        // Now 'Coke' appears in cart too.
        // Clicking cokeBtn again should work if the reference is stable? Yes.
        fireEvent.click(cokeBtn);

        // Total should be 150 + 40 + 40 = 230
        const totalElement = screen.getByText(/₹ 230\.00/i);
        expect(totalElement).toBeInTheDocument();
    });

    it('filters menu by category', async () => {
        renderPOS();
        await waitFor(() => screen.getByText('Main Course'));

        // Click Beverage category
        fireEvent.click(screen.getByText('Beverages'));

        expect(screen.getByText('Coke')).toBeInTheDocument();
        expect(screen.queryByText('Chicken Biryani')).not.toBeInTheDocument();
    });

    it('handles checkout successfully', async () => {
        api.post.mockResolvedValue({ data: { success: true } });
        renderPOS();
        await waitFor(() => screen.getByText('Chicken Biryani'));

        // Add item
        fireEvent.click(screen.getByText('Chicken Biryani').closest('button'));

        // Click Save
        const saveButton = screen.getByText('SAVE').closest('button');
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                '/orders',
                expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({ id: 1, qty: 1 })
                    ]),
                    type: 'Dine In',
                    paymentMode: 'Cash'
                })
            );
            expect(toast.success).toHaveBeenCalledWith('Order Saved!');
        });

        // Cart should be empty
        expect(screen.getByText('No Item Selected')).toBeInTheDocument();
    });
});
